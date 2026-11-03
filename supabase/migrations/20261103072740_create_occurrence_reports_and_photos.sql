-- Archive de ocorrências da Sonho Kids Brinquedos.
-- Todos os membros da empresa podem consultar e registrar; autor e owner/admin podem editar ou excluir.
create table public.occurrence_reports (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 3 and 140),
 category text not null check (category in ('Quebra de brinquedo','Prejuízo financeiro','Dano material','Problema na entrega','Problema durante evento','Acidente ou segurança','Outro')),
 severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
 occurred_at timestamptz not null,
 location text not null check (char_length(btrim(location)) between 2 and 240),
 description text not null check (char_length(btrim(description)) between 5 and 6000),
 loss_amount numeric(12,2) not null default 0 check (loss_amount>=0),
 created_by uuid references auth.users(id) on delete set null,
 created_by_name text not null,
 created_by_email text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index occurrence_reports_company_date_idx on public.occurrence_reports(company_id,occurred_at desc);
create index occurrence_reports_creator_idx on public.occurrence_reports(created_by,created_at desc);
alter table public.occurrence_reports enable row level security;
create policy occurrence_reports_select_company on public.occurrence_reports for select to authenticated using (public.is_company_member(company_id));
create policy occurrence_reports_insert_company on public.occurrence_reports for insert to authenticated with check (public.is_company_member(company_id) and created_by=(select auth.uid()));
create policy occurrence_reports_update_author_admin on public.occurrence_reports for update to authenticated using (public.is_company_member(company_id) and (created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=occurrence_reports.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))) with check (public.is_company_member(company_id) and (created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=occurrence_reports.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin'))));
create policy occurrence_reports_delete_author_admin on public.occurrence_reports for delete to authenticated using (public.is_company_member(company_id) and (created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=occurrence_reports.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin'))));
grant select,insert,update,delete on public.occurrence_reports to authenticated;

create table public.occurrence_photos (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 occurrence_id uuid not null references public.occurrence_reports(id) on delete cascade,
 storage_path text not null unique,
 caption text,
 uploaded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index occurrence_photos_occurrence_idx on public.occurrence_photos(company_id,occurrence_id,created_at);
create index occurrence_photos_occurrence_id_idx on public.occurrence_photos(occurrence_id);
create index occurrence_photos_uploaded_by_idx on public.occurrence_photos(uploaded_by) where uploaded_by is not null;
alter table public.occurrence_photos enable row level security;
create policy occurrence_photos_select_company on public.occurrence_photos for select to authenticated using (public.is_company_member(company_id));
create policy occurrence_photos_insert_author_admin on public.occurrence_photos for insert to authenticated with check (public.is_company_member(company_id) and uploaded_by=(select auth.uid()) and exists(select 1 from public.occurrence_reports o where o.id=occurrence_photos.occurrence_id and o.company_id=occurrence_photos.company_id and (o.created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=o.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))));
create policy occurrence_photos_update_author_admin on public.occurrence_photos for update to authenticated using (public.is_company_member(company_id) and exists(select 1 from public.occurrence_reports o where o.id=occurrence_photos.occurrence_id and o.company_id=occurrence_photos.company_id and (o.created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=o.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin'))))) with check (public.is_company_member(company_id) and uploaded_by=(select auth.uid()));
create policy occurrence_photos_delete_author_admin on public.occurrence_photos for delete to authenticated using (public.is_company_member(company_id) and exists(select 1 from public.occurrence_reports o where o.id=occurrence_photos.occurrence_id and o.company_id=occurrence_photos.company_id and (o.created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=o.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))));
grant select,insert,delete on public.occurrence_photos to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('occurrence-photos','occurrence-photos',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy occurrence_photos_storage_select on storage.objects for select to authenticated using (bucket_id='occurrence-photos' and exists(select 1 from public.occurrence_reports o where o.id=((storage.foldername(name))[2])::uuid and o.company_id=((storage.foldername(name))[1])::uuid and public.is_company_member(o.company_id)));
create policy occurrence_photos_storage_insert on storage.objects for insert to authenticated with check (bucket_id='occurrence-photos' and exists(select 1 from public.occurrence_reports o where o.id=((storage.foldername(name))[2])::uuid and o.company_id=((storage.foldername(name))[1])::uuid and public.is_company_member(o.company_id) and (o.created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=o.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))));
create policy occurrence_photos_storage_delete on storage.objects for delete to authenticated using (bucket_id='occurrence-photos' and exists(select 1 from public.occurrence_reports o where o.id=((storage.foldername(name))[2])::uuid and o.company_id=((storage.foldername(name))[1])::uuid and public.is_company_member(o.company_id) and (o.created_by=(select auth.uid()) or exists(select 1 from public.company_members cm where cm.company_id=o.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))));
