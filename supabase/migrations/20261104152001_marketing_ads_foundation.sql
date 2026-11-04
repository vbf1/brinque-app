-- Marketing and ad preparation module. Additive only; rental workflows remain unchanged.
create table public.marketing_settings (
 company_id uuid primary key references public.companies(id) on delete cascade,
 business_name text not null default '', whatsapp text not null default '',
 service_regions text[] not null default array['Contagem','Belo Horizonte']::text[],
 default_description text not null default '',
 default_call_to_action text not null default 'Chame no WhatsApp para consultar disponibilidade',
 updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.marketing_settings enable row level security;
create policy marketing_settings_select_member on public.marketing_settings for select to authenticated using (public.is_company_member(company_id));
create policy marketing_settings_insert_admin on public.marketing_settings for insert to authenticated with check (
 public.is_company_member(company_id) and updated_by=(select auth.uid()) and exists (
 select 1 from public.company_members cm where cm.company_id=marketing_settings.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));
create policy marketing_settings_update_admin on public.marketing_settings for update to authenticated using (
 public.is_company_member(company_id) and exists (select 1 from public.company_members cm where cm.company_id=marketing_settings.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))
 with check (public.is_company_member(company_id) and updated_by=(select auth.uid()) and exists (
 select 1 from public.company_members cm where cm.company_id=marketing_settings.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));
grant select,insert,update on public.marketing_settings to authenticated;

create table public.marketing_ads (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null,
 title text not null check (char_length(btrim(title)) between 5 and 180),
 description text not null check (char_length(btrim(description)) between 10 and 5000),
 keywords text[] not null default '{}'::text[], image_url text, image_prompt text not null default '',
 platforms text[] not null default array['facebook_marketplace']::text[],
 status text not null default 'draft' check (status in ('draft','pending_approval','approved','published','rejected')),
 approval_note text, approved_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz, published_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint marketing_ads_platforms_check check (platforms <@ array['facebook_marketplace','facebook_page','facebook_groups','instagram']::text[])
);
create index marketing_ads_company_status_created_idx on public.marketing_ads(company_id,status,created_at desc);
create index marketing_ads_product_idx on public.marketing_ads(company_id,product_id);
alter table public.marketing_ads enable row level security;
create policy marketing_ads_select_member on public.marketing_ads for select to authenticated using (public.is_company_member(company_id));
create policy marketing_ads_insert_admin on public.marketing_ads for insert to authenticated with check (
 public.is_company_member(company_id) and created_by=(select auth.uid()) and exists (
 select 1 from public.company_members cm where cm.company_id=marketing_ads.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));
create policy marketing_ads_update_admin on public.marketing_ads for update to authenticated using (
 public.is_company_member(company_id) and exists (select 1 from public.company_members cm where cm.company_id=marketing_ads.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')))
 with check (public.is_company_member(company_id) and exists (
 select 1 from public.company_members cm where cm.company_id=marketing_ads.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));
create policy marketing_ads_delete_admin on public.marketing_ads for delete to authenticated using (
 public.is_company_member(company_id) and exists (select 1 from public.company_members cm where cm.company_id=marketing_ads.company_id and cm.user_id=(select auth.uid()) and cm.role in ('owner','admin')));
grant select,insert,update,delete on public.marketing_ads to authenticated;

create or replace function public.set_marketing_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;
create trigger marketing_settings_updated_at before update on public.marketing_settings for each row execute function public.set_marketing_updated_at();
create trigger marketing_ads_updated_at before update on public.marketing_ads for each row execute function public.set_marketing_updated_at();
