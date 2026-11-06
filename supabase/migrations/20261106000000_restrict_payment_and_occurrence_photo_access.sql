-- Reconcile security policies applied directly to the KidsLoc database.
-- This migration records the already-reviewed rules in version control.
-- Safe to run on an environment where these policy names already exist.

begin;

-- Payment records: admins/owners manage records; staff can only read payments
-- attached to rentals they are assigned to manage.
drop policy if exists company_members_all on public.payments;
drop policy if exists payments_select_authorized_rental on public.payments;
drop policy if exists payments_insert_owner_admin on public.payments;
drop policy if exists payments_update_owner_admin on public.payments;
drop policy if exists payments_delete_owner_admin on public.payments;

create policy payments_select_authorized_rental
on public.payments
for select to authenticated
using (
  public.has_company_role(company_id, array['owner','admin']::text[])
  or public.can_manage_rental(company_id, rental_id)
);

create policy payments_insert_owner_admin
on public.payments
for insert to authenticated
with check (
  public.has_company_role(company_id, array['owner','admin']::text[])
);

create policy payments_update_owner_admin
on public.payments
for update to authenticated
using (
  public.has_company_role(company_id, array['owner','admin']::text[])
)
with check (
  public.has_company_role(company_id, array['owner','admin']::text[])
);

create policy payments_delete_owner_admin
on public.payments
for delete to authenticated
using (
  public.has_company_role(company_id, array['owner','admin']::text[])
);

-- Photo metadata must remain attached to an occurrence in the same company.
drop policy if exists occurrence_photos_update_author_admin on public.occurrence_photos;
create policy occurrence_photos_update_author_admin
on public.occurrence_photos
for update to authenticated
using (
  public.is_company_member(company_id)
  and exists (
    select 1
    from public.occurrence_reports o
    where o.id = occurrence_photos.occurrence_id
      and o.company_id = occurrence_photos.company_id
      and (
        o.created_by = (select auth.uid())
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = o.company_id
            and cm.user_id = (select auth.uid())
            and cm.role in ('owner','admin')
        )
      )
  )
)
with check (
  public.is_company_member(company_id)
  and uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.occurrence_reports o
    where o.id = occurrence_photos.occurrence_id
      and o.company_id = occurrence_photos.company_id
      and (
        o.created_by = (select auth.uid())
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = o.company_id
            and cm.user_id = (select auth.uid())
            and cm.role in ('owner','admin')
        )
      )
  )
);

commit;
