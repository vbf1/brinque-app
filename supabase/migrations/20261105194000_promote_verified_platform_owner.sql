-- Convert the unique company creator who also holds the owner membership into a global platform owner.
-- This migration is intentionally separate so the app and Edge Function are deployed first.
-- Resolve the account from the verified company membership instead of hardcoding generated UUIDs.
do $$
declare
  v_owner_candidates integer;
  v_user_id uuid;
  v_company_id uuid;
  v_membership_rows integer;
  v_platform_owner_rows integer;
begin
  select count(*) into v_owner_candidates
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.role = 'owner'
    and cm.user_id = c.created_by;

  if v_owner_candidates = 0 then
    select count(*) into v_platform_owner_rows from private.platform_owners;
    if v_platform_owner_rows = 1 then
      return;
    end if;
    raise exception 'Platform owner conversion aborted: no unique creator-owner membership was found.';
  end if;

  if v_owner_candidates <> 1 then
    raise exception 'Platform owner conversion aborted: expected exactly one creator-owner membership; found %.', v_owner_candidates;
  end if;

  select cm.user_id, cm.company_id
    into v_user_id, v_company_id
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.role = 'owner'
    and cm.user_id = c.created_by;

  select count(*) into v_membership_rows
  from public.company_members
  where user_id = v_user_id;

  if v_membership_rows <> 1 then
    raise exception 'Platform owner conversion aborted: expected the selected owner to have exactly one company membership; found %.', v_membership_rows;
  end if;

  insert into private.platform_owners(user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  delete from public.company_members
  where user_id = v_user_id
    and company_id = v_company_id
    and role = 'owner';
end;
$$;
