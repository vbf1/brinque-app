-- Rebuild the rental core while keeping the surrounding company, customer,
-- product, employee, finance and authentication tables intact.
-- This migration intentionally clears all old rental and contract registrations.
begin;

-- Contract rows are SET NULL on rental deletion, so remove them explicitly first.
delete from public.rental_contracts;
delete from public.rentals;

-- Restart the visible numbering after the reset.
alter table public.rental_contracts alter column contract_number restart with 1;
alter table public.rentals alter column rental_number restart with 1;

-- Remove obsolete RPC overloads. The new app uses only the canonical timed APIs.
drop function if exists public.create_rental_with_items(uuid,uuid,date,date,text,text,numeric,jsonb);
drop function if exists public.create_rental_with_items(uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[]);
drop function if exists public.update_rental_with_items(uuid,uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[]);

create or replace function public.can_manage_rental(p_company_id uuid, p_rental_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.rentals r
    where r.id = p_rental_id
      and r.company_id = p_company_id
      and (
        public.has_company_role(p_company_id, array['owner','admin'])
        or exists (
          select 1 from public.rental_responsibles rr
          where rr.company_id = r.company_id
            and rr.rental_id = r.id
            and rr.user_id = (select auth.uid())
        )
      )
  );
$function$;

create or replace function public.save_rental_responsibles(
  p_company_id uuid,
  p_rental_id uuid,
  p_user_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_ids uuid[] := coalesce(p_user_ids, array[]::uuid[]);
  v_creator uuid;
  v_count integer;
begin
  if v_user_id is null or not public.is_company_member(p_company_id) then
    raise exception 'Acesso negado à empresa.';
  end if;

  select r.created_by into v_creator
  from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;

  if v_creator is distinct from v_user_id
     and not public.can_manage_rental(p_company_id, p_rental_id) then
    raise exception 'Você não tem permissão para alterar os responsáveis desta locação.';
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0
     and not public.has_company_role(p_company_id, array['owner','admin']) then
    v_ids := array[v_user_id];
  end if;

  select count(distinct x) into v_count from unnest(v_ids) as x;
  if v_count <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'Um funcionário foi selecionado mais de uma vez.';
  end if;

  if exists (
    select 1 from unnest(v_ids) as x
    where not exists (
      select 1 from public.company_members cm
      where cm.company_id = p_company_id and cm.user_id = x
    )
  ) then
    raise exception 'Um dos responsáveis não pertence mais à empresa.';
  end if;

  delete from public.rental_responsibles
  where rental_id = p_rental_id and company_id = p_company_id;

  insert into public.rental_responsibles(
    company_id, rental_id, user_id, employee_name_snapshot, assigned_by
  )
  select p_company_id, p_rental_id, cm.user_id,
    coalesce(nullif(btrim(pr.full_name), ''), 'Funcionário'), v_user_id
  from public.company_members cm
  left join public.profiles pr on pr.id = cm.user_id
  where cm.company_id = p_company_id and cm.user_id = any(v_ids);
end;
$function$;

create or replace function public.create_rental_with_items(
  p_company_id uuid,
  p_customer_id uuid,
  p_start_date date,
  p_end_date date,
  p_status text,
  p_delivery_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_delivery_address text,
  p_responsible_user_ids uuid[],
  p_start_time time without time zone,
  p_end_time time without time zone
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_rental_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_item_id uuid;
  v_quantity integer;
  v_used integer;
  v_unit_ids uuid[];
  v_unit_id uuid;
  v_unit_price numeric;
  v_item_count integer;
  v_distinct_products integer;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'Acesso negado à empresa.'; end if;
  if p_customer_id is null or not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = p_company_id
  ) then raise exception 'Cliente não encontrado nesta empresa.'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Período da locação inválido.';
  end if;
  if p_start_time is null or p_end_time is null
     or (p_start_date = p_end_date and p_end_time <= p_start_time) then
    raise exception 'Horário da locação inválido.';
  end if;
  if p_status not in ('pending','confirmed','ongoing') then
    raise exception 'Status inválido para uma nova locação.';
  end if;
  if p_delivery_method not in ('delivery','customer_pickup') then
    raise exception 'Modalidade de entrega inválida.';
  end if;
  if p_delivery_method = 'delivery' and nullif(btrim(p_delivery_address), '') is null then
    raise exception 'Informe o endereço de entrega.';
  end if;
  if p_total_amount is null or p_total_amount < 0 then
    raise exception 'Valor total da locação inválido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A locação precisa ter pelo menos um brinquedo.';
  end if;

  select count(*), count(distinct (e.value->>'product_id')::uuid)
    into v_item_count, v_distinct_products
  from jsonb_array_elements(p_items) as e(value);
  if v_item_count <> v_distinct_products then
    raise exception 'Não selecione o mesmo brinquedo mais de uma vez.';
  end if;

  insert into public.rentals(
    company_id, customer_id, start_date, end_date, start_time, end_time,
    status, delivery_method, delivery_address, total_amount, created_by
  ) values (
    p_company_id, p_customer_id, p_start_date, p_end_date, p_start_time, p_end_time,
    p_status, p_delivery_method,
    case when p_delivery_method = 'delivery' then nullif(btrim(p_delivery_address), '') else null end,
    p_total_amount, v_user_id
  ) returning id into v_rental_id;

  for v_item in
    select e.value from jsonb_array_elements(p_items) as e(value)
    order by (e.value->>'product_id')::uuid
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then raise exception 'Quantidade inválida.'; end if;

    select p.* into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.company_id = p_company_id and p.active = true
    for update;
    if not found then raise exception 'Brinquedo não encontrado ou inativo.'; end if;

    v_unit_price := coalesce((v_item->>'unit_price')::numeric, v_product.daily_price);
    if v_unit_price is null or v_unit_price < 0 then raise exception 'Preço unitário inválido.'; end if;

    if v_product.inventory_mode = 'quantity' then
      select coalesce(sum(ri.quantity), 0)::integer into v_used
      from public.rental_items ri
      join public.rentals r on r.id = ri.rental_id
      where ri.product_id = v_product.id
        and r.status in ('pending','confirmed','ongoing')
        and (r.start_date + coalesce(r.start_time, time '00:00')) < (p_end_date + p_end_time)
        and (r.end_date + coalesce(r.end_time, time '24:00')) > (p_start_date + p_start_time);
      if v_used + v_quantity > v_product.total_quantity then
        raise exception 'Estoque insuficiente para o brinquedo: %.', v_product.name;
      end if;
    else
      v_unit_ids := array[]::uuid[];
      for v_unit_id in
        select pu.id from public.product_units pu
        where pu.product_id = v_product.id
          and pu.company_id = p_company_id
          and pu.status = 'available'
          and not exists (
            select 1
            from public.rental_item_units riu
            join public.rental_items ri on ri.id = riu.rental_item_id
            join public.rentals r on r.id = ri.rental_id
            where riu.product_unit_id = pu.id
              and r.status in ('pending','confirmed','ongoing')
              and (r.start_date + coalesce(r.start_time, time '00:00')) < (p_end_date + p_end_time)
              and (r.end_date + coalesce(r.end_time, time '24:00')) > (p_start_date + p_start_time)
          )
        order by pu.asset_code nulls last, pu.id
        limit v_quantity for update of pu skip locked
      loop
        v_unit_ids := array_append(v_unit_ids, v_unit_id);
      end loop;
      if coalesce(array_length(v_unit_ids, 1), 0) < v_quantity then
        raise exception 'Unidades individuais disponíveis insuficientes para: %.', v_product.name;
      end if;
    end if;

    insert into public.rental_items(
      company_id, rental_id, product_id, quantity, unit_price, subtotal
    ) values (
      p_company_id, v_rental_id, v_product.id, v_quantity, v_unit_price, v_quantity * v_unit_price
    ) returning id into v_item_id;

    if v_product.inventory_mode = 'individual' then
      insert into public.rental_item_units(company_id, rental_item_id, product_unit_id)
      select p_company_id, v_item_id, u.id from unnest(v_unit_ids) as u(id);
    end if;
  end loop;

  perform public.save_rental_responsibles(p_company_id, v_rental_id, p_responsible_user_ids);
  insert into public.rental_events(company_id, rental_id, event_type, description, created_by)
  values (p_company_id, v_rental_id, 'created',
    'Locação criada pela nova operação transacional, com estoque e responsáveis validados.', v_user_id);

  return v_rental_id;
end;
$function$;

create or replace function public.update_rental_with_items(
  p_company_id uuid,
  p_rental_id uuid,
  p_customer_id uuid,
  p_start_date date,
  p_end_date date,
  p_status text,
  p_delivery_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_delivery_address text,
  p_responsible_user_ids uuid[],
  p_start_time time without time zone,
  p_end_time time without time zone
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_rental public.rentals%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_item_id uuid;
  v_quantity integer;
  v_used integer;
  v_unit_ids uuid[];
  v_unit_id uuid;
  v_unit_price numeric;
  v_item_count integer;
  v_distinct_products integer;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'Acesso negado à empresa.'; end if;

  select r.* into v_rental
  from public.rentals r
  where r.id = p_rental_id and r.company_id = p_company_id
  for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;
  if not public.can_manage_rental(p_company_id, p_rental_id) then
    raise exception 'Você não tem permissão para editar esta locação.';
  end if;

  if p_customer_id is null or not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = p_company_id
  ) then raise exception 'Cliente não encontrado nesta empresa.'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Período da locação inválido.';
  end if;
  if p_start_time is null or p_end_time is null
     or (p_start_date = p_end_date and p_end_time <= p_start_time) then
    raise exception 'Horário da locação inválido.';
  end if;
  if p_status not in ('pending','confirmed','ongoing','completed','cancelled') then
    raise exception 'Status de locação inválido.';
  end if;
  if p_delivery_method not in ('delivery','customer_pickup') then
    raise exception 'Modalidade de entrega inválida.';
  end if;
  if p_delivery_method = 'delivery' and nullif(btrim(p_delivery_address), '') is null then
    raise exception 'Informe o endereço de entrega.';
  end if;
  if p_total_amount is null or p_total_amount < 0 then
    raise exception 'Valor total da locação inválido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A locação precisa ter pelo menos um brinquedo.';
  end if;

  select count(*), count(distinct (e.value->>'product_id')::uuid)
    into v_item_count, v_distinct_products
  from jsonb_array_elements(p_items) as e(value);
  if v_item_count <> v_distinct_products then
    raise exception 'Não selecione o mesmo brinquedo mais de uma vez.';
  end if;

  update public.rentals set
    customer_id = p_customer_id,
    start_date = p_start_date,
    end_date = p_end_date,
    start_time = p_start_time,
    end_time = p_end_time,
    status = p_status,
    delivery_method = p_delivery_method,
    delivery_address = case when p_delivery_method = 'delivery' then nullif(btrim(p_delivery_address), '') else null end,
    total_amount = p_total_amount
  where id = p_rental_id and company_id = p_company_id;

  delete from public.rental_items
  where rental_id = p_rental_id and company_id = p_company_id;

  for v_item in
    select e.value from jsonb_array_elements(p_items) as e(value)
    order by (e.value->>'product_id')::uuid
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then raise exception 'Quantidade inválida.'; end if;

    select p.* into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.company_id = p_company_id and p.active = true
    for update;
    if not found then raise exception 'Brinquedo não encontrado ou inativo.'; end if;

    v_unit_price := coalesce((v_item->>'unit_price')::numeric, v_product.daily_price);
    if v_unit_price is null or v_unit_price < 0 then raise exception 'Preço unitário inválido.'; end if;

    if p_status in ('pending','confirmed','ongoing') then
      if v_product.inventory_mode = 'quantity' then
        select coalesce(sum(ri.quantity), 0)::integer into v_used
        from public.rental_items ri
        join public.rentals r on r.id = ri.rental_id
        where ri.product_id = v_product.id
          and r.id <> p_rental_id
          and r.status in ('pending','confirmed','ongoing')
          and (r.start_date + coalesce(r.start_time, time '00:00')) < (p_end_date + p_end_time)
          and (r.end_date + coalesce(r.end_time, time '24:00')) > (p_start_date + p_start_time);
        if v_used + v_quantity > v_product.total_quantity then
          raise exception 'Estoque insuficiente para o brinquedo: %.', v_product.name;
        end if;
      else
        v_unit_ids := array[]::uuid[];
        for v_unit_id in
          select pu.id from public.product_units pu
          where pu.product_id = v_product.id
            and pu.company_id = p_company_id
            and pu.status = 'available'
            and not exists (
              select 1
              from public.rental_item_units riu
              join public.rental_items ri on ri.id = riu.rental_item_id
              join public.rentals r on r.id = ri.rental_id
              where riu.product_unit_id = pu.id
                and r.id <> p_rental_id
                and r.status in ('pending','confirmed','ongoing')
                and (r.start_date + coalesce(r.start_time, time '00:00')) < (p_end_date + p_end_time)
                and (r.end_date + coalesce(r.end_time, time '24:00')) > (p_start_date + p_start_time)
            )
          order by pu.asset_code nulls last, pu.id
          limit v_quantity for update of pu skip locked
        loop
          v_unit_ids := array_append(v_unit_ids, v_unit_id);
        end loop;
        if coalesce(array_length(v_unit_ids, 1), 0) < v_quantity then
          raise exception 'Unidades individuais disponíveis insuficientes para: %.', v_product.name;
        end if;
      end if;
    else
      if v_quantity > v_product.total_quantity then
        raise exception 'A quantidade informada excede o total cadastrado para: %.', v_product.name;
      end if;
      v_unit_ids := array[]::uuid[];
    end if;

    insert into public.rental_items(
      company_id, rental_id, product_id, quantity, unit_price, subtotal
    ) values (
      p_company_id, p_rental_id, v_product.id, v_quantity, v_unit_price, v_quantity * v_unit_price
    ) returning id into v_item_id;

    if p_status in ('pending','confirmed','ongoing')
       and v_product.inventory_mode = 'individual' then
      insert into public.rental_item_units(company_id, rental_item_id, product_unit_id)
      select p_company_id, v_item_id, u.id from unnest(v_unit_ids) as u(id);
    end if;
  end loop;

  perform public.save_rental_responsibles(p_company_id, p_rental_id, p_responsible_user_ids);
  insert into public.rental_events(company_id, rental_id, event_type, description, created_by)
  values (p_company_id, p_rental_id, 'updated',
    'Locação editada pela nova operação transacional, com estoque e responsáveis validados.', v_user_id);
end;
$function$;

revoke all on function public.can_manage_rental(uuid,uuid) from public, anon;
grant execute on function public.can_manage_rental(uuid,uuid) to authenticated;
revoke all on function public.save_rental_responsibles(uuid,uuid,uuid[]) from public, anon;
grant execute on function public.save_rental_responsibles(uuid,uuid,uuid[]) to authenticated;
revoke all on function public.create_rental_with_items(uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[],time,time) from public, anon;
grant execute on function public.create_rental_with_items(uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[],time,time) to authenticated;
revoke all on function public.update_rental_with_items(uuid,uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[],time,time) from public, anon;
grant execute on function public.update_rental_with_items(uuid,uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[],time,time) to authenticated;

commit;
