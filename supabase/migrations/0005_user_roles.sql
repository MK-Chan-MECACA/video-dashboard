-- User roles: 'operator' (agency team, full access) vs 'client' (reviewers:
-- read the pipeline, approve/reject, comment). The role lives in the JWT's
-- app_metadata claim — server-controlled, set at invite time.
--
-- Missing claim = operator: the app is invite-only, so every user created
-- before this migration is an operator. That default also keeps live operator
-- sessions (whose JWTs predate the claim) fully working the moment this runs.

create or replace function public.jwt_role() returns text
language sql stable as
$$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'operator') $$;

-- Backfill existing users as operators so the claim is explicit going forward.
update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"operator"}'
  where raw_app_meta_data ->> 'role' is null;

-- Audit identity for logged-in (session) reviewers. Token-link and API-key
-- reviews leave these null and keep using reviewer_name.
alter table approvals
  add column if not exists reviewer_user_id uuid,
  add column if not exists reviewer_email text;
alter table review_comments
  add column if not exists reviewer_user_id uuid,
  add column if not exists reviewer_email text;

do $$
declare t text;
begin
  -- Tighten the blanket authenticated policies to operators only.
  foreach t in array array[
    'videos','script_versions','assets','brand_assets','jobs',
    'review_links','review_comments','approvals','posts','pipeline_events',
    'app_settings','api_keys']
  loop
    execute format('drop policy if exists %I on %I', t || '_operator_all', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (public.jwt_role() = ''operator'')
         with check (public.jwt_role() = ''operator'')',
      t || '_operator_all', t);
  end loop;

  -- Clients: read the pipeline. Deliberately excluded: app_settings, api_keys,
  -- brand_assets, review_links (token hashes).
  foreach t in array array[
    'videos','script_versions','assets','jobs',
    'review_comments','approvals','posts','pipeline_events']
  loop
    execute format('drop policy if exists %I on %I', t || '_client_select', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using (public.jwt_role() = ''client'')',
      t || '_client_select', t);
  end loop;

  -- Clients: leave comments and decisions (the session review routes are the
  -- primary gate; this is defense in depth for direct PostgREST access).
  foreach t in array array['review_comments','approvals']
  loop
    execute format('drop policy if exists %I on %I', t || '_client_insert', t);
    execute format(
      'create policy %I on %I for insert to authenticated
         with check (public.jwt_role() = ''client'')',
      t || '_client_insert', t);
  end loop;
end $$;
