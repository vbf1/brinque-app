-- Registro histórico de vários funcionários responsáveis por cada locação.
-- O nome fica salvo como snapshot para preservar a identificação mesmo se o acesso do funcionário for removido.
create table if not exists public.rental_responsibles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  employee_name_snapshot text not null,
  assigned_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists rental_responsibles_unique_user
  on public.rental_responsibles(rental_id,user_id) where user_id is not null;
create index if not exists rental_responsibles_company_rental_idx
  on public.rental_responsibles(company_id,rental_id);
create index if not exists rental_responsibles_user_id_idx on public.rental_responsibles(user_id) where user_id is not null;
create index if not exists rental_responsibles_assigned_by_idx on public.rental_responsibles(assigned_by) where assigned_by is not null;

alter table public.rental_responsibles enable row level security;
create policy rental_responsibles_select_company on public.rental_responsibles
  for select to authenticated using (public.is_company_member(company_id));
create policy rental_responsibles_insert_company on public.rental_responsibles
  for insert to authenticated with check (
    public.is_company_member(company_id)
    and assigned_by=(select auth.uid())
    and user_id is not null
    and exists(select 1 from public.company_members cm where cm.company_id=rental_responsibles.company_id and cm.user_id=rental_responsibles.user_id)
    and employee_name_snapshot=coalesce((select nullif(btrim(p.full_name),'') from public.profiles p where p.id=rental_responsibles.user_id),'Funcionário')
  );
create policy rental_responsibles_delete_company on public.rental_responsibles
  for delete to authenticated using (public.is_company_member(company_id));
grant select,insert,delete on public.rental_responsibles to authenticated;
revoke insert,update,delete on public.rental_responsibles from anon;

-- Permite que integrantes da mesma empresa vejam somente os nomes dos perfis da equipe.
create policy profiles_select_company_members on public.profiles
  for select to authenticated using (
    id=(select auth.uid()) or exists (
      select 1 from public.company_members cm
      where cm.user_id=profiles.id and public.is_company_member(cm.company_id)
    )
  );

create or replace function public.save_rental_responsibles(
  p_company_id uuid,p_rental_id uuid,p_user_ids uuid[]
) returns void
language plpgsql
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_ids uuid[]:=coalesce(p_user_ids,array[]::uuid[]);
  v_count integer;
begin
  if v_user_id is null or not public.is_company_member(p_company_id) then
    raise exception 'Acesso negado à empresa.';
  end if;
  if not exists(select 1 from public.rentals r where r.id=p_rental_id and r.company_id=p_company_id) then
    raise exception 'Locação não encontrada nesta empresa.';
  end if;
  select count(distinct x) into v_count from unnest(v_ids) as x;
  if v_count<>coalesce(array_length(v_ids,1),0) then
    raise exception 'Um funcionário foi selecionado mais de uma vez.';
  end if;
  if exists(select 1 from unnest(v_ids) as x where not exists(
    select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=x
  )) then
    raise exception 'Um dos responsáveis não pertence mais à empresa.';
  end if;
  delete from public.rental_responsibles where rental_id=p_rental_id and company_id=p_company_id;
  insert into public.rental_responsibles(company_id,rental_id,user_id,employee_name_snapshot,assigned_by)
  select p_company_id,p_rental_id,cm.user_id,coalesce(nullif(btrim(pr.full_name),''),'Funcionário'),v_user_id
  from public.company_members cm left join public.profiles pr on pr.id=cm.user_id
  where cm.company_id=p_company_id and cm.user_id=any(v_ids);
end;
$$;
revoke execute on function public.save_rental_responsibles(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.save_rental_responsibles(uuid,uuid,uuid[]) to authenticated;

-- Nova assinatura preserva a função antiga e recebe endereço e responsáveis na mesma transação da locação.
-- A lógica de validação de estoque continua igual à versão anterior.
create or replace function public.create_rental_with_items(
  p_company_id uuid,p_customer_id uuid,p_start_date date,p_end_date date,
  p_status text,p_delivery_method text,p_total_amount numeric,p_items jsonb,
  p_delivery_address text,p_responsible_user_ids uuid[]
) returns uuid
language plpgsql
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_rental_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_item_id uuid;
  v_quantity integer;
  v_used integer;
  v_unit_ids uuid[];
  v_unit_id uuid;
  v_unit_price numeric;
begin
  if v_user_id is null then raise exception 'Usuário não autenticado.'; end if;
  if not public.is_company_member(p_company_id) then raise exception 'Acesso negado à empresa.'; end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then raise exception 'Período da locação inválido.'; end if;
  if p_status not in ('pending','confirmed','ongoing') then raise exception 'Status de locação inválido.'; end if;
  if p_delivery_method not in ('delivery','customer_pickup') then raise exception 'Modalidade de entrega inválida.'; end if;
  if p_total_amount is null or p_total_amount<0 or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Informe os itens e o valor da locação.'; end if;
  if not exists(select 1 from public.customers c where c.id=p_customer_id and c.company_id=p_company_id) then raise exception 'Cliente não encontrado nesta empresa.'; end if;
  insert into public.rentals(company_id,customer_id,start_date,end_date,status,delivery_method,delivery_address,total_amount,created_by)
  values(p_company_id,p_customer_id,p_start_date,p_end_date,p_status,p_delivery_method,
    case when p_delivery_method='delivery' then nullif(btrim(p_delivery_address),'') else null end,
    p_total_amount,v_user_id)
  returning id into v_rental_id;
  for v_item in select e.value from jsonb_array_elements(p_items) as e(value) order by (e.value->>'product_id')::uuid loop
    v_quantity:=(v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity<1 then raise exception 'Quantidade inválida.'; end if;
    select p.* into v_product from public.products p where p.id=(v_item->>'product_id')::uuid and p.company_id=p_company_id and p.active=true for update;
    if not found then raise exception 'Brinquedo não encontrado ou inativo.'; end if;
    v_unit_price:=coalesce((v_item->>'unit_price')::numeric,v_product.daily_price);
    if v_unit_price<0 then raise exception 'Preço unitário inválido.'; end if;
    if v_product.inventory_mode='quantity' then
      select coalesce(sum(ri.quantity),0)::integer into v_used from public.rental_items ri join public.rentals r on r.id=ri.rental_id
      where ri.product_id=v_product.id and r.status in ('pending','confirmed','ongoing') and r.start_date<=p_end_date and r.end_date>=p_start_date;
      if v_used+v_quantity>v_product.total_quantity then raise exception 'Estoque insuficiente para o brinquedo: %.',v_product.name; end if;
    else
      v_unit_ids:=array[]::uuid[];
      for v_unit_id in select pu.id from public.product_units pu
        where pu.product_id=v_product.id and pu.company_id=p_company_id and pu.status='available'
          and not exists(select 1 from public.rental_item_units riu join public.rental_items ri on ri.id=riu.rental_item_id join public.rentals r on r.id=ri.rental_id
            where riu.product_unit_id=pu.id and r.status in ('pending','confirmed','ongoing') and r.start_date<=p_end_date and r.end_date>=p_start_date)
        order by pu.asset_code nulls last,pu.id limit v_quantity for update of pu skip locked
      loop v_unit_ids:=array_append(v_unit_ids,v_unit_id); end loop;
      if coalesce(array_length(v_unit_ids,1),0)<v_quantity then raise exception 'Unidades individuais disponíveis insuficientes para: %.',v_product.name; end if;
    end if;
    insert into public.rental_items(company_id,rental_id,product_id,quantity,unit_price,subtotal)
      values(p_company_id,v_rental_id,v_product.id,v_quantity,v_unit_price,v_quantity*v_unit_price) returning id into v_item_id;
    if v_product.inventory_mode='individual' then
      insert into public.rental_item_units(company_id,rental_item_id,product_unit_id) select p_company_id,v_item_id,u.id from unnest(v_unit_ids) as u(id);
    end if;
  end loop;
  perform public.save_rental_responsibles(p_company_id,v_rental_id,p_responsible_user_ids);
  insert into public.rental_events(company_id,rental_id,event_type,description,created_by)
    values(p_company_id,v_rental_id,'created','Locação criada com validação transacional de estoque e responsáveis registrados.',v_user_id);
  return v_rental_id;
end;
$$;
revoke execute on function public.create_rental_with_items(uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[]) from public,anon;
grant execute on function public.create_rental_with_items(uuid,uuid,date,date,text,text,numeric,jsonb,text,uuid[]) to authenticated;
