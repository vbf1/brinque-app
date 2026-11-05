-- Allow the signed-in user to read only their own platform-owner marker.
-- The public RPC is invoker-security; the private helper remains internal to definer functions.
grant usage on schema private to authenticated;
grant select on table private.platform_owners to authenticated;
drop policy if exists platform_owners_select_self on private.platform_owners;
create policy platform_owners_select_self
on private.platform_owners
for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from private.platform_owners po
    where po.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_platform_owner() from public, anon;
grant execute on function public.is_platform_owner() to authenticated;
