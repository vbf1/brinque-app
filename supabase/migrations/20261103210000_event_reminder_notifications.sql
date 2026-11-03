-- Event reminder preferences and idempotent delivery tracking for KidsLoc.
-- Global defaults are opt-in; each rental may inherit, customize, or disable reminders.

create table if not exists public.company_event_reminder_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  days_before integer not null default 3 check (days_before between 1 and 30),
  notifications_per_day integer not null default 1 check (notifications_per_day between 1 and 4),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.company_event_reminder_settings enable row level security;
grant select, insert, update, delete on public.company_event_reminder_settings to authenticated;

drop policy if exists "Members read company event reminder settings" on public.company_event_reminder_settings;
create policy "Members read company event reminder settings"
on public.company_event_reminder_settings for select to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_event_reminder_settings.company_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins insert company event reminder settings" on public.company_event_reminder_settings;
create policy "Admins insert company event reminder settings"
on public.company_event_reminder_settings for insert to authenticated
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_event_reminder_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

drop policy if exists "Admins update company event reminder settings" on public.company_event_reminder_settings;
create policy "Admins update company event reminder settings"
on public.company_event_reminder_settings for update to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_event_reminder_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_event_reminder_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

drop policy if exists "Admins delete company event reminder settings" on public.company_event_reminder_settings;
create policy "Admins delete company event reminder settings"
on public.company_event_reminder_settings for delete to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = company_event_reminder_settings.company_id
      and cm.user_id = (select auth.uid())
      and cm.role in ('owner','admin')
  )
);

create table if not exists public.rental_event_reminder_settings (
  rental_id uuid primary key references public.rentals(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  enabled boolean not null default true,
  days_before integer not null default 3 check (days_before between 1 and 30),
  notifications_per_day integer not null default 1 check (notifications_per_day between 1 and 4),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists rental_event_reminder_settings_company_idx
  on public.rental_event_reminder_settings(company_id);

alter table public.rental_event_reminder_settings enable row level security;
grant select, insert, update, delete on public.rental_event_reminder_settings to authenticated;

drop policy if exists "Users read reminders for manageable rentals" on public.rental_event_reminder_settings;
create policy "Users read reminders for manageable rentals"
on public.rental_event_reminder_settings for select to authenticated
using (public.can_manage_rental(company_id, rental_id));

drop policy if exists "Users insert reminders for manageable rentals" on public.rental_event_reminder_settings;
create policy "Users insert reminders for manageable rentals"
on public.rental_event_reminder_settings for insert to authenticated
with check (
  public.can_manage_rental(company_id, rental_id)
  and exists (
    select 1 from public.rentals r
    where r.id = rental_event_reminder_settings.rental_id
      and r.company_id = rental_event_reminder_settings.company_id
  )
);

drop policy if exists "Users update reminders for manageable rentals" on public.rental_event_reminder_settings;
create policy "Users update reminders for manageable rentals"
on public.rental_event_reminder_settings for update to authenticated
using (public.can_manage_rental(company_id, rental_id))
with check (
  public.can_manage_rental(company_id, rental_id)
  and exists (
    select 1 from public.rentals r
    where r.id = rental_event_reminder_settings.rental_id
      and r.company_id = rental_event_reminder_settings.company_id
  )
);

drop policy if exists "Users delete reminders for manageable rentals" on public.rental_event_reminder_settings;
create policy "Users delete reminders for manageable rentals"
on public.rental_event_reminder_settings for delete to authenticated
using (public.can_manage_rental(company_id, rental_id));

-- Service-role-only idempotency ledger prevents duplicate push notifications.
create table if not exists public.rental_event_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rental_id uuid not null references public.rentals(id) on delete cascade,
  reminder_date date not null,
  slot_index smallint not null check (slot_index between 1 and 4),
  status text not null default 'processing' check (status in ('processing','sent')),
  device_count integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rental_id, reminder_date, slot_index)
);

create index if not exists rental_event_reminder_deliveries_date_idx
  on public.rental_event_reminder_deliveries(reminder_date);

alter table public.rental_event_reminder_deliveries enable row level security;
revoke all on public.rental_event_reminder_deliveries from anon, authenticated;
grant all on public.rental_event_reminder_deliveries to service_role;

-- Supabase Cron is included in the free tier. The job calls the existing push
-- Edge Function every 15 minutes; it sends only reminders whose time slot is due.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.unschedule(jobid)
from cron.job
where jobname = 'kidsloc-event-reminders';

select cron.schedule(
  'kidsloc-event-reminders',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://wcxvswomcfpeuhnbxivh.supabase.co/functions/v1/send-employee-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_hC1UBMmLe0U41oUHfFxfMQ_mYrsel51',
        'x-brinque-webhook-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'brinque_push_webhook_secret' limit 1)
      ),
      body := jsonb_build_object('action', 'event_reminders'),
      timeout_milliseconds := 60000
    );
  $job$
);
