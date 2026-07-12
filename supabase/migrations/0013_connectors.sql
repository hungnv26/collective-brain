-- 0013 — Connector framework (Phase 0). Source adapters that fetch external
-- messages (Slack, Gmail, ...) and feed CB's existing ingest pipeline. This
-- migration is the storage + permission scaffold; per-provider adapters and the
-- OAuth flows land in later phases. Connector sync jobs reuse the existing
-- ingest_jobs / review_items path (source_kind 'url', provider in source_uri).

-- A configured link to an external channel. Metadata is org-readable; the
-- OAuth/API secrets live in a separate table only the service role can touch.
create table connections (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id)   on delete cascade,
  provider        text not null,                       -- 'slack' | 'gmail' | 'whatsapp' | 'instagram'
  status          text not null default 'active',      -- 'active' | 'paused' | 'error'
  target_space_id uuid references spaces(id) on delete set null,  -- where ingested nodes land
  config          jsonb not null default '{}'::jsonb,  -- channel selection, label filter, ...
  sync_cursor     text,                                -- provider cursor for incremental sync
  last_synced_at  timestamptz,
  last_error      text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index connections_org_idx on connections(org_id);

-- Secrets split out so RLS keeps them out of every member-readable query: RLS is
-- ON with NO authenticated policy, so only the service role (BYPASSRLS) — i.e.
-- the sync job — can read or write tokens.
create table connection_secrets (
  connection_id uuid primary key references connections(id) on delete cascade,
  secrets       jsonb not null default '{}'::jsonb,   -- encrypted at the app layer before store
  updated_at    timestamptz not null default now()
);

-- Idempotency: one row per external item ever ingested for an org+provider, so a
-- re-sync never re-distills the same email/message.
create table ingested_sources (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  provider    text not null,
  external_id text not null,
  node_id     uuid references nodes(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, provider, external_id)
);
create index ingested_sources_org_idx on ingested_sources(org_id, provider);

-- One row per sync attempt — observability + retry.
create table sync_runs (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null references connections(id) on delete cascade,
  org_id        uuid not null references orgs(id) on delete cascade,
  status        text not null default 'ok',            -- 'ok' | 'error'
  items         int  not null default 0,
  error         text,
  created_at    timestamptz not null default now()
);
create index sync_runs_conn_idx on sync_runs(connection_id, created_at desc);

alter table connections        enable row level security;
alter table connection_secrets enable row level security;
alter table ingested_sources   enable row level security;
alter table sync_runs          enable row level security;

-- connections: org members see the configured channels; owners/admins manage.
create policy connections_select on connections for select to authenticated
  using (app.is_org_member(org_id));
create policy connections_manage on connections for all to authenticated
  using (app.has_org_role(org_id, array['owner','admin']::membership_role[]))
  with check (app.has_org_role(org_id, array['owner','admin']::membership_role[]));

-- connection_secrets: intentionally NO policy for authenticated → default-deny.
-- Only the service role can touch tokens.

-- ingested_sources + sync_runs: org members may read (a "what's synced" view);
-- writes happen under the service role during sync.
create policy ingested_sources_select on ingested_sources for select to authenticated
  using (app.is_org_member(org_id));
create policy sync_runs_select on sync_runs for select to authenticated
  using (app.is_org_member(org_id));

grant select, insert, update, delete on connections to authenticated, service_role;
grant select on ingested_sources, sync_runs to authenticated;
grant select, insert, update, delete on connection_secrets, ingested_sources, sync_runs to service_role;
