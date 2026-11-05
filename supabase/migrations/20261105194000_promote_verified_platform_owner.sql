-- Convert only the previously verified Sonho Kids owner to a global platform owner.
-- Kept separate so the app and Edge Function can be deployed before detaching.
do $$
declare
  v_user_id uuid := 'e9ee1898-2cb0-42d0-a40a-a1176c5f7635';
  v_company_id uuid := 'd6086a26-623a-4ca3-8e9e-eef3c5f44b1d';
  v_owner_rows integer;
  v_membership_rows integer;
begin
  select count(*) into v_owner_rows from public.company_members
  where user_id = v_user_id and company_id = v_company_id and role = 'owner';
  select count(*) into v_membership_rows from public.company_members where user_id = v_user_id;
  if v_owner_rows = 1 and v_membership_rows = 1 then
    insert into private.platform_owners(user_id) values (v_user_id) on conflict (user_id) do nothing;
    delete from public.company_members where user_id = v_user_id and company_id = v_company_id and role = 'owner';
  elsif v_owner_rows = 0 and v_membership_rows = 0
        and exists (select 1 from private.platform_owners where user_id = v_user_id) then
    null;
  else
    raise exception 'Platform owner conversion aborted: expected exactly one owner membership for the verified account and no other memberships; found owner rows %, total memberships %', v_owner_rows, v_membership_rows;
  end if;
end;
$$;
