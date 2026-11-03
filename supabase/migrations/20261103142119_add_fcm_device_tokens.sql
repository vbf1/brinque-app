create table if not exists public.fcm_device_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fcm_device_tokens_company_user_idx
  on public.fcm_device_tokens(company_id, user_id);

alter table public.fcm_device_tokens enable row level security;

drop policy if exists "Members register own FCM devices" on public.fcm_device_tokens;
create policy "Members register own FCM devices"
on public.fcm_device_tokens for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = fcm_device_tokens.company_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists "Members read own FCM devices" on public.fcm_device_tokens;
create policy "Members read own FCM devices"
on public.fcm_device_tokens for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = fcm_device_tokens.company_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists "Members update own FCM devices" on public.fcm_device_tokens;
create policy "Members update own FCM devices"
on public.fcm_device_tokens for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = fcm_device_tokens.company_id
      and cm.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = fcm_device_tokens.company_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists "Members remove own FCM devices" on public.fcm_device_tokens;
create policy "Members remove own FCM devices"
on public.fcm_device_tokens for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = fcm_device_tokens.company_id
      and cm.user_id = (select auth.uid())
  )
);
