begin;

-- Rentals: split broad company-wide ALL access into explicit creation and scoped access.
drop policy if exists company_members_all on public.rentals;
create policy rentals_insert_company_creator
on public.rentals for insert to authenticated
with check (
  public.is_company_member(company_id)
  and created_by = (select auth.uid())
);

-- Rental items: members can create items only under a rental they just created;
-- later reads and mutations follow the assigned-rental policies.
drop policy if exists company_members_all on public.rental_items;
create policy rental_items_insert_creator_or_assigned
on public.rental_items for insert to authenticated
with check (
  exists (
    select 1 from public.rentals r
    where r.id = rental_items.rental_id
      and r.company_id = rental_items.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

-- Individual units are visible through the parent rental and only mutable
-- for a rental created by the current user or assigned to the current user.
drop policy if exists company_members_all on public.rental_item_units;
create policy rental_item_units_insert_creator_or_assigned
on public.rental_item_units for insert to authenticated
with check (
  exists (
    select 1
    from public.rental_items ri
    join public.rentals r
      on r.id = ri.rental_id and r.company_id = ri.company_id
    where ri.id = rental_item_units.rental_item_id
      and ri.company_id = rental_item_units.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

-- Rental events: retain scoped history access, but allow the creator to
-- write the initial "created" event in the same transaction.
drop policy if exists company_members_all on public.rental_events;
create policy rental_events_insert_creator_or_assigned
on public.rental_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.rentals r
    where r.id = rental_events.rental_id
      and r.company_id = rental_events.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

-- Responsible assignments: remove broad company-wide read/write policies.
drop policy if exists rental_responsibles_delete_company on public.rental_responsibles;
drop policy if exists rental_responsibles_insert_company on public.rental_responsibles;
drop policy if exists rental_responsibles_select_company on public.rental_responsibles;

drop policy if exists rental_responsibles_insert_scope on public.rental_responsibles;
create policy rental_responsibles_insert_creator_or_assigned
on public.rental_responsibles for insert to authenticated
with check (
  assigned_by = (select auth.uid())
  and exists (
    select 1 from public.rentals r
    where r.id = rental_responsibles.rental_id
      and r.company_id = rental_responsibles.company_id
      and (
        r.created_by = (select auth.uid())
        or public.can_manage_rental(r.company_id, r.id)
      )
  )
);

commit;