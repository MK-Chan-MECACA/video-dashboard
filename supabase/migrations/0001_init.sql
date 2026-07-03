-- Video Dashboard — initial schema
-- Single-operator tool: authenticated users get full access;
-- anon gets nothing (magic-link review flows go through server routes
-- using the service role, with the link token as the only credential).

create extension if not exists pgcrypto;

create type video_status as enum (
  'draft',
  'script_generating',
  'script_review',
  'script_changes_requested',
  'script_approved',
  'voice_generating',
  'avatar_generating',
  'scenes_generating',
  'rendering',
  'video_review',
  'video_changes_requested',
  'approved',
  'scheduled',
  'posted',
  'failed'
);

create table videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic_brief text,
  status video_status not null default 'draft',
  status_error text,
  current_script_version_id uuid,
  caption text,
  schedule_at timestamptz,
  ghl_post_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table script_versions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  version int not null,
  hook text not null default '',
  cta text not null default '',
  -- [{ index, voiceover, broll_prompt, model_path }]
  scenes jsonb not null default '[]',
  full_voiceover_text text not null default '',
  created_by text not null default 'claude' check (created_by in ('claude', 'operator')),
  claude_model text,
  created_at timestamptz not null default now(),
  unique (video_id, version)
);

alter table videos
  add constraint videos_current_script_version_fk
  foreign key (current_script_version_id) references script_versions(id) on delete set null;

create table assets (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  kind text not null check (kind in
    ('voiceover','avatar_video','scene_clip','subtitle_ass','final_video','thumbnail')),
  scene_index int,
  r2_key text not null,
  duration_s numeric,
  size_bytes bigint,
  -- word_timestamps, wavespeed prediction id, model, seed, ...
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index assets_video_kind_idx on assets(video_id, kind);

create table brand_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('logo','outro','bgm','avatar_reference')),
  name text not null,
  r2_key text not null,
  is_default boolean not null default false,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  type text not null check (type in
    ('generate_script','tts','avatar','scene','render','generate_caption','ghl_post')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in
    ('queued','running','awaiting_external','succeeded','failed')),
  external_id text,
  external_status text,
  external_output jsonb,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_claim_idx on jobs(status, run_after) where status in ('queued','awaiting_external');
create index jobs_video_idx on jobs(video_id);
create index jobs_external_idx on jobs(external_id) where external_id is not null;

create table review_links (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  kind text not null check (kind in ('script','video')),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days',
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table review_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  script_version_id uuid references script_versions(id) on delete set null,
  review_link_id uuid references review_links(id) on delete set null,
  section_key text not null, -- 'hook' | 'scene_1'..'scene_3' | 'cta' | 'video'
  video_timestamp_s numeric,
  author_name text not null default 'Reviewer',
  body text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index review_comments_video_idx on review_comments(video_id);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  review_link_id uuid references review_links(id) on delete set null,
  kind text not null check (kind in ('script','video')),
  decision text not null check (decision in ('approved','changes_requested')),
  comment text,
  reviewer_name text not null default 'Reviewer',
  created_at timestamptz not null default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  ghl_post_id text not null,
  ghl_account_id text not null,
  caption text not null,
  schedule_date timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','published','failed')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table pipeline_events (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  event text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index pipeline_events_video_idx on pipeline_events(video_id, created_at);

-- updated_at maintenance
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger videos_updated_at before update on videos
  for each row execute function set_updated_at();
create trigger jobs_updated_at before update on jobs
  for each row execute function set_updated_at();

-- RLS: operator (any authenticated user) full access; anon nothing.
-- Review pages and the worker use the service role, which bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array[
    'videos','script_versions','assets','brand_assets','jobs',
    'review_links','review_comments','approvals','posts','pipeline_events']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      t || '_operator_all', t);
  end loop;
end $$;
