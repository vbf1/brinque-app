-- The existing platform_owner_all RLS policy still restricts company inserts to global owners.
-- Grant the table-level privilege needed for that RLS policy to be evaluated.
grant insert on table public.companies to authenticated;
