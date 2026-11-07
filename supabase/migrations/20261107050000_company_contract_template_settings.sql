-- Per-company editable identity and landlord details for the canonical rental contract.
alter table public.companies
  add column if not exists contract_settings jsonb not null default '{}'::jsonb,
  add column if not exists contract_logo_url text;

comment on column public.companies.contract_settings is
  'Company-specific landlord identity, contract defaults and visual identity. Contract snapshots remain immutable per issued document.';

alter table public.customers
  add column if not exists cpf text,
  add column if not exists rg text,
  add column if not exists zip text,
  add column if not exists neighborhood text,
  add column if not exists city_state text;
