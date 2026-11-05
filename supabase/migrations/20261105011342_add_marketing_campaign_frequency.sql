alter table public.marketing_settings
  add column if not exists campaign_frequency text not null default 'twice_weekly'
  check (campaign_frequency in ('daily', 'twice_weekly', 'weekly'));
