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
  p_responsible_user_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path to ''
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

  select r.* into v_rental from public.rentals r
  where r.id=p_rental_id and r.company_id=p_company_id for update;
  if not found then raise exception 'Locação não encontrada nesta empresa.'; end if;
  if not public.can_manage_rental(p_company_id,p_rental_id) then
    raise exception 'Você não tem permissão para editar esta locação.';
  end if;
  if p_customer_id is null or not exists (
    select 1 from public.customers c where c.id=p_customer_id and c.company_id=p_company_id
  ) then raise exception 'Cliente não encontrado nesta empresa.'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'Período da locação inválido.';
  end if;
  if p_status not in ('pending','confirmed','ongoing','completed','cancelled') then
    raise exception 'Status de locação inválido.';
  end if;
  if p_delivery_method not in ('delivery','customer_pickup') then
    raise exception 'Modalidade de entrega inválida.';
  end if;
  if p_delivery_method='delivery' and nullif(btrim(p_delivery_address),'') is null then
    raise exception 'Informe o endereço de entrega.';
  end if;
  if p_total_amount is null or p_total_amount<0 then raise exception 'Valor total da locação inválido.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'A locação precisa ter pelo menos um brinquedo.';
  end if;

  select count(*),count(distinct (e.value->>'product_id')::uuid)
  into v_item_count,v_distinct_products
  from jsonb_array_elements(p_items) as e(value);
  if v_item_count<>v_distinct_products then
    raise exception 'Não selecione o mesmo brinquedo mais de uma vez.';
  end if;

  update public.rentals set
    customer_id=p_customer_id,start_date=p_start_date,end_date=p_end_date,status=p_status,
    delivery_method=p_delivery_method,
    delivery_address=case when p_delivery_method='delivery' then nullif(btrim(p_delivery_address),'') else null end,
    total_amount=p_total_amount
  where id=p_rental_id and company_id=p_company_id;

  -- Os itens e vínculos de unidades são substituídos atomicamente.
  -- Qualquer erro de estoque desfaz toda a edição, sem deixar dados parciais.
  delete from public.rental_items where rental_id=p_rental_id and company_id=p_company_id;

  for v_item in
    select e.value from jsonb_array_elements(p_items) as e(value)
    order by (e.value->>'product_id')::uuid
  loop
    v_quantity:=(v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity<1 then raise exception 'Quantidade inválida.'; end if;

    select p.* into v_product from public.products p
    where p.id=(v_item->>'product_id')::uuid and p.company_id=p_company_id and p.active=true
    for update;
    if not found then raise exception 'Brinquedo não encontrado ou inativo.'; end if;

    v_unit_price:=coalesce((v_item->>'unit_price')::numeric,v_product.daily_price);
    if v_unit_price is null or v_unit_price<0 then raise exception 'Preço unitário inválido.'; end if;

    if p_status in ('pending','confirmed','ongoing') then
      if v_product.inventory_mode='quantity' then
        select coalesce(sum(ri.quantity),0)::integer into v_used
        from public.rental_items ri join public.rentals r on r.id=ri.rental_id
        where ri.product_id=v_product.id and r.id<>p_rental_id
          and r.status in ('pending','confirmed','ongoing')
          and r.start_date<=p_end_date and r.end_date>=p_start_date;
        if v_used+v_quantity>v_product.total_quantity then
          raise exception 'Estoque insuficiente para o brinquedo: %.',v_product.name;
        end if;
      else
        v_unit_ids:=array[]::uuid[];
        for v_unit_id in
          select pu.id from public.product_units pu
          where pu.product_id=v_product.id and pu.company_id=p_company_id and pu.status='available'
            and not exists (
              select 1 from public.rental_item_units riu
              join public.rental_items ri on ri.id=riu.rental_item_id
              join public.rentals r on r.id=ri.rental_id
              where riu.product_unit_id=pu.id and r.id<>p_rental_id
                and r.status in ('pending','confirmed','ongoing')
                and r.start_date<=p_end_date and r.end_date>=p_start_date
            )
          order by pu.asset_code nulls last,pu.id
          limit v_quantity for update of pu skip locked
        loop v_unit_ids:=array_append(v_unit_ids,v_unit_id); end loop;
        if coalesce(array_length(v_unit_ids,1),0)<v_quantity then
          raise exception 'Unidades individuais disponíveis insuficientes para: %.',v_product.name;
        end if;
      end if;
    else
      if v_quantity>v_product.total_quantity then
        raise exception 'A quantidade informada excede o total cadastrado para: %.',v_product.name;
      end if;
      v_unit_ids:=array[]::uuid[];
    end if;

    insert into public.rental_items(company_id,rental_id,product_id,quantity,unit_price,subtotal)
    values(p_company_id,p_rental_id,v_product.id,v_quantity,v_unit_price,v_quantity*v_unit_price)
    returning id into v_item_id;

    if p_status in ('pending','confirmed','ongoing') and v_product.inventory_mode='individual' then
      insert into public.rental_item_units(company_id,rental_item_id,product_unit_id)
      select p_company_id,v_item_id,u.id from unnest(v_unit_ids) as u(id);
    end if;
  end loop;

  perform public.save_rental_responsibles(p_company_id,p_rental_id,p_responsible_user_ids);
  insert into public.rental_events(company_id,rental_id,event_type,description,created_by)
  values(p_company_id,p_rental_id,'updated',
    'Locação editada: dados, brinquedos e quantidades atualizados com validação transacional de estoque.',
    v_user_id);
end;
$function$;

revoke all on function public.update_rental_with_items(uuid,uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[]) from public,anon;
grant execute on function public.update_rental_with_items(uuid,uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[]) to authenticated;
