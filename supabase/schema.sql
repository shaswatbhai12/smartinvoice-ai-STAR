-- SmartInvoice AI: per-user database with Clerk login.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Prerequisite: Clerk added as a Third-Party Auth provider in Supabase (see SETUP_LOGIN.md).

create table if not exists public.vendor_profiles (
  user_id    text        not null default (auth.jwt() ->> 'sub'),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.invoices (
  user_id        text        not null default (auth.jwt() ->> 'sub'),
  profile_id     text        not null default '',
  invoice_number text        not null,
  invoice_date   text        not null default '',
  client_name    text        not null default '',
  client_gstin   text        not null default '',
  data           jsonb       not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, profile_id, invoice_number)
);

create index if not exists invoices_user_recent_idx
  on public.invoices (user_id, updated_at desc);

-- Row level security: a signed-in user can only see and change their own rows.
alter table public.vendor_profiles enable row level security;
alter table public.invoices        enable row level security;

drop policy if exists "own profiles" on public.vendor_profiles;
create policy "own profiles" on public.vendor_profiles
  for all to authenticated
  using      ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "own invoices" on public.invoices;
create policy "own invoices" on public.invoices
  for all to authenticated
  using      ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

-- Signed-out visitors (the public key alone) get no access at all.
revoke all on public.vendor_profiles from anon;
revoke all on public.invoices        from anon;
grant select, insert, update, delete on public.vendor_profiles to authenticated;
grant select, insert, update, delete on public.invoices        to authenticated;

-- Monthly report delivery settings. The scheduled Edge Function uses these rows
-- to send the previous month's invoice and receivables report.
create table if not exists public.monthly_report_settings (
  user_id        text primary key,
  recipient_email text not null,
  enabled        boolean not null default true,
  timezone       text not null default 'Asia/Kolkata',
  updated_at     timestamptz not null default now()
);

create table if not exists public.monthly_report_runs (
  user_id       text not null,
  report_month  text not null,
  sent_at       timestamptz not null default now(),
  recipient_email text not null,
  primary key (user_id, report_month)
);

create table if not exists public.monthly_report_test_runs (
  user_id text primary key,
  sent_at timestamptz not null default now(),
  recipient_email text not null
);

create table if not exists public.email_preferences (
  user_id text primary key,
  email text not null,
  unsubscribed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.monthly_report_settings enable row level security;
alter table public.monthly_report_runs enable row level security;
alter table public.monthly_report_test_runs enable row level security;
alter table public.email_preferences enable row level security;

drop policy if exists "own monthly report settings" on public.monthly_report_settings;
create policy "own monthly report settings" on public.monthly_report_settings
  for all to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "own monthly report runs" on public.monthly_report_runs;
create policy "own monthly report runs" on public.monthly_report_runs
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "own monthly report test runs" on public.monthly_report_test_runs;
create policy "own monthly report test runs" on public.monthly_report_test_runs
  for select to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "own email preferences" on public.email_preferences;
create policy "own email preferences" on public.email_preferences
  for all to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

revoke all on public.monthly_report_settings from anon;
revoke all on public.monthly_report_runs from anon;
revoke all on public.monthly_report_test_runs from anon;
grant select, insert, update, delete on public.monthly_report_settings to authenticated;
grant select on public.monthly_report_runs to authenticated;
grant select on public.monthly_report_test_runs to authenticated;
revoke all on public.email_preferences from anon;
grant select, insert, update on public.email_preferences to authenticated;

-- OLD OPEN TABLE: if you ever created "app_storage" from the earlier README, anyone with the
-- public key can still read it. After confirming it holds nothing you need, remove it:
-- drop table if exists public.app_storage;
