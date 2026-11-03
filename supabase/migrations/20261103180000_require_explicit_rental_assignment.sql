-- Restrict rental access to owner/admin or explicitly assigned company members.
-- Staff and managers do not gain access merely because they created a rental.
-- This function is also used by restrictive RLS policies on rental items,
-- rental events, item units and responsible assignments.

create or replace function public.can_manage_rental(p_company_id uuid, p_rental_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.rentals r
    where r.id = p_rental_id
      and r.company_id = p_company_id
      and (
        public.has_company_role(p_company_id, array['owner','admin'])
        or exists (
          select 1
          from public.rental_responsibles rr
          where rr.company_id = r.company_id
            and rr.rental_id = r.id
            and rr.user_id = (select auth.uid())
        )
      )
  );
$function$;
