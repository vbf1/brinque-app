-- Restrict rental visibility to the owner/admin or explicitly assigned staff.
-- Existing company-wide permissive policies remain in place; these restrictive
-- SELECT policies narrow their result without changing rental creation workflows.

create index if not exists rental_responsibles_company_rental_user_idx
  on public.rental_responsibles(company_id, rental_id, user_id);

drop policy if exists rentals_scope_select on public.rentals;
create policy rentals_scope_select
on public.rentals as restrictive
for select to authenticated
using (
  exists (
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
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.company_members cm
    where cm.company_id = rental_responsibles.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

drop policy if exists rental_items_scope_select on public.rental_items;
create policy rental_items_scope_select
on public.rental_items as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_items.rental_id
      and r.company_id = rental_items.company_id
  )
);

drop policy if exists rental_events_scope_select on public.rental_events;
create policy rental_events_scope_select
on public.rental_events as restrictive
for select to authenticated
using (
  exists (
    select 1 from public.rentals r
    where r.id = rental_events.rental_id
      and r.company_id = rental_events.company_id
  )
);

drop policy if exists rental_item_units_scope_select on public.rental_item_units;
create policy rental_item_units_scope_select
on public.rental_item_units as restrictive
for select to authenticated
using (
  exists (
    select 1
    from public.rental_items ri
    where ri.id = rental_item_units.rental_item_id
      and ri.company_id = rental_item_units.company_id
  )
);
