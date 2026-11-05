-- Restrict contract and private PDF access to users who can manage the linked rental.
create index if not exists rental_contracts_created_by_idx
  on public.rental_contracts(created_by);

-- Keep the immutable contract snapshot and signed PDF if the rental is deleted.
-- Owners/admins retain access through the explicit company-role policy below.
alter table public.rental_contracts alter column rental_id drop not null;
alter table public.rental_contracts drop constraint if exists rental_contracts_rental_id_fkey;
alter table public.rental_contracts
  add constraint rental_contracts_rental_id_fkey
  foreign key (rental_id) references public.rentals(id) on delete set null;

-- Owners/admins retain company-wide access through can_manage_rental().
drop policy if exists rental_contracts_select_company_members on public.rental_contracts;
create policy rental_contracts_select_assigned_rentals on public.rental_contracts
  for select to authenticated
  using ((public.has_company_role(company_id, array['owner','admin']) or (rental_id is not null and public.can_manage_rental(company_id, rental_id))));

drop policy if exists rental_contracts_insert_company_members on public.rental_contracts;
create policy rental_contracts_insert_assigned_rentals on public.rental_contracts
  for insert to authenticated
  with check (rental_id is not null and public.can_manage_rental(company_id, rental_id));

drop policy if exists rental_contracts_update_company_members on public.rental_contracts;
create policy rental_contracts_update_assigned_rentals on public.rental_contracts
  for update to authenticated
  using ((public.has_company_role(company_id, array['owner','admin']) or (rental_id is not null and public.can_manage_rental(company_id, rental_id))))
  with check ((public.has_company_role(company_id, array['owner','admin']) or (rental_id is not null and public.can_manage_rental(company_id, rental_id))));

drop policy if exists rental_contracts_delete_company_members on public.rental_contracts;
create policy rental_contracts_delete_assigned_rentals on public.rental_contracts
  for delete to authenticated
  using ((public.has_company_role(company_id, array['owner','admin']) or (rental_id is not null and public.can_manage_rental(company_id, rental_id))));

-- The storage object path is company_id/contract_id/file.pdf. Resolve the
-- linked rental before granting access; the bucket remains private.
drop policy if exists rental_contracts_storage_select on storage.objects;
create policy rental_contracts_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rental-contracts'
    and exists (
      select 1 from public.rental_contracts c
      where c.company_id = ((storage.foldername(name))[1])::uuid
        and c.id = ((storage.foldername(name))[2])::uuid
        and (public.has_company_role(c.company_id, array['owner','admin']) or (c.rental_id is not null and public.can_manage_rental(c.company_id, c.rental_id)))
    )
  );

drop policy if exists rental_contracts_storage_insert on storage.objects;
create policy rental_contracts_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'rental-contracts'
    and exists (
      select 1 from public.rental_contracts c
      where c.company_id = ((storage.foldername(name))[1])::uuid
        and c.id = ((storage.foldername(name))[2])::uuid
        and (public.has_company_role(c.company_id, array['owner','admin']) or (c.rental_id is not null and public.can_manage_rental(c.company_id, c.rental_id)))
    )
  );

drop policy if exists rental_contracts_storage_update on storage.objects;
create policy rental_contracts_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'rental-contracts'
    and exists (
      select 1 from public.rental_contracts c
      where c.company_id = ((storage.foldername(name))[1])::uuid
        and c.id = ((storage.foldername(name))[2])::uuid
        and (public.has_company_role(c.company_id, array['owner','admin']) or (c.rental_id is not null and public.can_manage_rental(c.company_id, c.rental_id)))
    )
  )
  with check (
    bucket_id = 'rental-contracts'
    and exists (
      select 1 from public.rental_contracts c
      where c.company_id = ((storage.foldername(name))[1])::uuid
        and c.id = ((storage.foldername(name))[2])::uuid
        and (public.has_company_role(c.company_id, array['owner','admin']) or (c.rental_id is not null and public.can_manage_rental(c.company_id, c.rental_id)))
    )
  );

drop policy if exists rental_contracts_storage_delete on storage.objects;
create policy rental_contracts_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'rental-contracts'
    and exists (
      select 1 from public.rental_contracts c
      where c.company_id = ((storage.foldername(name))[1])::uuid
        and c.id = ((storage.foldername(name))[2])::uuid
        and (public.has_company_role(c.company_id, array['owner','admin']) or (c.rental_id is not null and public.can_manage_rental(c.company_id, c.rental_id)))
    )
  );
