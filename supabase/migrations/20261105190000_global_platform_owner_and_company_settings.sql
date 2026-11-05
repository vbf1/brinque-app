-- Introduce a platform-level owner without attaching that account to any company.
-- Existing company admins and staff continue to be scoped by company_members.

create schema if not exists private;

create table if not exists private.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table private.platform_owners enable row level security;

create or replace function private.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.platform_owners po
    where po.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_platform_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_platform_owner() to authenticated;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_owner();
$$;
revoke all on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_owner()
    or exists (
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = (select auth.uid())
    );
$$;

create or replace function public.has_company_role(p_company_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      private.is_platform_owner()
      and 'owner' = any(p_roles)
    )
    or exists (
      select 1
      from public.company_members m
      where m.company_id = p_company_id
        and m.user_id = (select auth.uid())
        and m.role = any(p_roles)
    );
$$;

-- Give the global owner access to company records and every company-scoped
-- table, while preserving all existing restrictions for ordinary members.
drop policy if exists platform_owner_all on public.companies;
create policy platform_owner_all
on public.companies as permissive
for all to authenticated
using (private.is_platform_owner())
with check (private.is_platform_owner());

do $$
declare
  item record;
begin
  for item in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = n.nspname
     and col.table_name = c.relname
     and col.column_name = 'company_id'
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname not in ('fcm_device_tokens', 'push_subscriptions')
  loop
    execute format('drop policy if exists platform_owner_all on public.%I', item.table_name);
    execute format(
      'create policy platform_owner_all on public.%I as permissive for all to authenticated using (private.is_platform_owner()) with check (private.is_platform_owner())',
      item.table_name
    );
  end loop;
end;
$$;

-- Rental visibility has an existing restrictive policy. Explicitly include
-- the platform owner there; permissive policies alone cannot override it.
drop policy if exists rentals_scope_select on public.rentals;
create policy rentals_scope_select
on public.rentals as restrictive
for select to authenticated
using (
  private.is_platform_owner()
  or exists (
    select 1
    from public.company_members cm
    where cm.company_id = rentals.company_id
      and cm.user_id = (select auth.uid())
      and (
        cm.role in ('owner','admin')
        or exists (
          select 1
          from public.rental_responsibles rr
          where rr.company_id = rentals.company_id
            and rr.rental_id = rentals.id
            and rr.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists rental_responsibles_scope_select on public.rental_responsibles;
create policy rental_responsibles_scope_select
on public.rental_responsibles as restrictive
for select to authenticated
using (
  private.is_platform_owner()
  or user_id = (select auth.uid())
  or exists (
    select 1
    from public.company_members cm
    where cm.company_id = rental_responsibles.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

-- Company-owned media and documents remain scoped to the existing buckets.
drop policy if exists platform_owner_company_assets on storage.objects;
create policy platform_owner_company_assets
on storage.objects as permissive
for all to authenticated
using (
  private.is_platform_owner()
  and bucket_id in ('company-branding', 'occurrence-photos', 'product-images', 'rental-contracts')
)
with check (
  private.is_platform_owner()
  and bucket_id in ('company-branding', 'occurrence-photos', 'product-images', 'rental-contracts')
);

-- Promote only the previously verified owner account. Abort rather than
-- detaching a different account or one with additional company memberships.
do $$
declare
  v_user_id uuid := 'e9ee1898-2cb0-42d0-a40a-a1176c5f7635';
  v_company_id uuid := 'd6086a26-623a-4ca3-8e9e-eef3c5f44b1d';
  v_owner_rows integer;
  v_membership_rows integer;
begin
  select count(*) into v_owner_rows
  from public.company_members
  where user_id = v_user_id
    and company_id = v_company_id
    and role = 'owner';

  select count(*) into v_membership_rows
  from public.company_members
  where user_id = v_user_id;

  if v_owner_rows = 1 and v_membership_rows = 1 then
    insert into private.platform_owners(user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    delete from public.company_members
    where user_id = v_user_id
      and company_id = v_company_id
      and role = 'owner';
  elsif v_owner_rows = 0 and v_membership_rows = 0
        and exists (select 1 from private.platform_owners where user_id = v_user_id) then
    null;
  else
    raise exception 'Platform owner conversion aborted: expected exactly one owner membership for the verified account and no other memberships; found owner rows %, total memberships %',
      v_owner_rows, v_membership_rows;
  end if;
end;
$$;
