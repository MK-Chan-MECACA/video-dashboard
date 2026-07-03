-- Simple key-value store for operator preferences
-- (HeyGen voice, default posting time, etc. — API keys stay in env vars).
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
create policy app_settings_operator_all on app_settings
  for all to authenticated using (true) with check (true);
