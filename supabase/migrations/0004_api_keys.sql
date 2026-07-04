-- API keys for the public REST API + MCP server.
-- The full key is shown once at creation; only the SHA-256 hash is stored.
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  scopes text[] not null default '{read,write}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table api_keys enable row level security;

-- Single-operator app: any authenticated dashboard user manages keys.
create policy api_keys_operator_all on api_keys
  for all to authenticated using (true) with check (true);
