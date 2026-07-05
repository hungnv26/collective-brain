-- Collective Brain — core relational schema (Sprint 1: Foundation)
-- Faithful to note/collective-brain-sdlc-plan.md §2a, minus AI-runtime tables
-- (embeddings/pgvector, ingest_jobs, review_items, conversations, messages,
-- questions_log, api_keys, agent_runs) which land in their own sprints.

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------- enums ----------
create type membership_role as enum ('owner', 'admin', 'lead', 'member', 'viewer');
create type space_kind      as enum ('private', 'team', 'org');
create type grant_access    as enum ('read', 'write');
create type node_status     as enum ('draft', 'reviewed', 'stale', 'archived');
create type link_rel        as enum ('supports', 'contradicts', 'related', 'extends');
create type invite_status   as enum ('pending', 'accepted', 'revoked', 'expired');
create type promotion_status as enum ('pending', 'approved', 'rejected');

-- ---------- tenancy ----------
create table orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  region     text not null default 'ap-southeast-2',   -- AU data residency
  plan       text not null default 'trial',
  created_at timestamptz not null default now()
);

-- Mirror of auth.users; on real Supabase, populated by a trigger on auth.users.
create table users (
  id         uuid primary key,            -- == auth.users.id / auth.uid()
  email      text not null unique,
  name       text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id)  on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       membership_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table teams (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams(id)  on delete cascade,
  user_id uuid not null references users(id)  on delete cascade,
  is_lead boolean not null default false,
  primary key (team_id, user_id)
);

-- ---------- spaces & permissions ----------
create table spaces (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  kind          space_kind not null,
  owner_user_id uuid references users(id) on delete cascade,  -- private only
  team_id       uuid references teams(id) on delete cascade,  -- team only
  name          text not null,
  created_at    timestamptz not null default now(),
  constraint space_shape check (
    (kind = 'private' and owner_user_id is not null and team_id is null) or
    (kind = 'team'    and team_id is not null       and owner_user_id is null) or
    (kind = 'org'     and owner_user_id is null      and team_id is null)
  )
);

-- Cross-cutting grants (a user or a team gets read/write to a space).
create table space_grants (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references spaces(id) on delete cascade,
  user_id    uuid references users(id) on delete cascade,
  team_id    uuid references teams(id) on delete cascade,
  access     grant_access not null default 'read',
  created_at timestamptz not null default now(),
  constraint grant_subject check (
    (user_id is not null and team_id is null) or
    (user_id is null and team_id is not null)
  )
);

-- ---------- nodes ----------
create table nodes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id)   on delete cascade,
  space_id    uuid not null references spaces(id) on delete cascade,
  type        text not null default 'fact',
  title       text not null,
  slug        text not null,
  body_md     text not null default '',
  frontmatter jsonb not null default '{}'::jsonb,
  confidence  text,
  status      node_status not null default 'draft',
  created_by  uuid references users(id),
  source_ref  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (space_id, slug)
);

create table node_versions (
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references nodes(id) on delete cascade,
  org_id      uuid not null references orgs(id)  on delete cascade,
  body_md     text not null,
  frontmatter jsonb not null default '{}'::jsonb,
  edited_by   uuid references users(id),
  created_at  timestamptz not null default now()
);

create table links (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id)  on delete cascade,
  from_node  uuid not null references nodes(id) on delete cascade,
  to_node    uuid not null references nodes(id) on delete cascade,
  rel        link_rel not null default 'related',
  created_at timestamptz not null default now(),
  unique (from_node, to_node, rel)
);

-- ---------- org lifecycle: invites & promotions ----------
create table invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  email      text not null,
  role       membership_role not null default 'member',
  token      text not null unique,
  status     invite_status not null default 'pending',
  invited_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table promotions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id)   on delete cascade,
  node_id      uuid not null references nodes(id)  on delete cascade,
  from_space   uuid not null references spaces(id) on delete cascade,
  to_space     uuid not null references spaces(id) on delete cascade,
  requested_by uuid references users(id),
  approved_by  uuid references users(id),
  status       promotion_status not null default 'pending',
  created_at   timestamptz not null default now()
);

-- ---------- indexes ----------
create index memberships_user_idx  on memberships(user_id);
create index memberships_org_idx   on memberships(org_id);
create index team_members_user_idx on team_members(user_id);
create index spaces_org_idx        on spaces(org_id);
create index spaces_owner_idx      on spaces(owner_user_id);
create index spaces_team_idx       on spaces(team_id);
create index space_grants_space_idx on space_grants(space_id);
create index nodes_org_idx         on nodes(org_id);
create index nodes_space_idx       on nodes(space_id);
create index node_versions_node_idx on node_versions(node_id);
create index links_org_idx         on links(org_id);
create index links_from_idx        on links(from_node);
create index invites_org_idx       on invites(org_id);
create index promotions_org_idx    on promotions(org_id);
