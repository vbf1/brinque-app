-- Corrige as políticas de Storage das fotos do estoque.
-- O nome do objeto segue o padrão: company_id/product_id/filename.
-- A política anterior referenciava p.name (coluna textual do produto) em vez
-- de storage.objects.name, impedindo a validação do caminho do arquivo.

drop policy if exists product_images_storage_insert on storage.objects;
drop policy if exists product_images_storage_select on storage.objects;
drop policy if exists product_images_storage_update on storage.objects;
drop policy if exists product_images_storage_delete on storage.objects;

create policy product_images_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.products p
    where p.id = (storage.foldername(objects.name))[2]::uuid
      and p.company_id = (storage.foldername(objects.name))[1]::uuid
      and public.is_company_member(p.company_id)
  )
);

create policy product_images_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.products p
    where p.id = (storage.foldername(objects.name))[2]::uuid
      and p.company_id = (storage.foldername(objects.name))[1]::uuid
      and public.is_company_member(p.company_id)
  )
);

create policy product_images_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.products p
    where p.id = (storage.foldername(objects.name))[2]::uuid
      and p.company_id = (storage.foldername(objects.name))[1]::uuid
      and public.is_company_member(p.company_id)
  )
)
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.products p
    where p.id = (storage.foldername(objects.name))[2]::uuid
      and p.company_id = (storage.foldername(objects.name))[1]::uuid
      and public.is_company_member(p.company_id)
  )
);

create policy product_images_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.products p
    where p.id = (storage.foldername(objects.name))[2]::uuid
      and p.company_id = (storage.foldername(objects.name))[1]::uuid
      and public.is_company_member(p.company_id)
  )
);
