-- Sprint 4 — Ask: conversations, cited messages, knowledge-gap log, and the
-- vector retrieval RPC that complements keyword search_nodes (0004).

create type message_role as enum ('user', 'assistant');

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id)  on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  title      text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  org_id          uuid not null references orgs(id) on delete cascade,
  role            message_role not null,
  content         text not null,
  citations       jsonb not null default '[]'::jsonb,   -- [{n, node_id, title}]
  feedback        text,                                  -- 'up' | 'down' | null
  created_at      timestamptz not null default now()
);

create table questions_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid references users(id),
  question    text not null,
  answered    boolean not null default false,
  gap_note_id uuid references nodes(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index conversations_user_idx on conversations(user_id);
create index messages_conv_idx      on messages(conversation_id);
create index questions_log_org_idx  on questions_log(org_id);

-- ---------- RLS ----------
alter table conversations enable row level security;
alter table messages      enable row level security;
alter table questions_log enable row level security;

-- Conversations are private to the user (Ask is a personal thread).
create policy conversations_select on conversations for select to authenticated
  using (user_id = auth.uid());
create policy conversations_insert on conversations for insert to authenticated
  with check (user_id = auth.uid() and app.is_org_member(org_id));
create policy conversations_update on conversations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy conversations_delete on conversations for delete to authenticated
  using (user_id = auth.uid());

create policy messages_select on messages for select to authenticated
  using (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy messages_insert on messages for insert to authenticated
  with check (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy messages_update on messages for update to authenticated
  using (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- Knowledge gaps are visible org-wide; anyone logs their own; admins resolve.
create policy questions_log_select on questions_log for select to authenticated
  using (app.is_org_member(org_id));
create policy questions_log_insert on questions_log for insert to authenticated
  with check (user_id = auth.uid() and app.is_org_member(org_id));
create policy questions_log_update on questions_log for update to authenticated
  using (app.has_org_role(org_id, array['owner','admin']::membership_role[]))
  with check (app.has_org_role(org_id, array['owner','admin']::membership_role[]));

-- ---------- vector retrieval ----------
-- @pglite-skip-begin  (pgvector unavailable in the PGlite test harness)
create or replace function public.match_nodes(p_org uuid, p_embedding text, p_k int default 8)
returns table(node_id uuid, distance float) language sql stable security invoker set search_path = public as $$
  select e.node_id, min(e.embedding <=> p_embedding::vector(384)) as distance
  from embeddings e
  where e.org_id = p_org             -- RLS on embeddings limits to readable nodes
  group by e.node_id
  order by distance asc
  limit p_k;
$$;

grant execute on function public.match_nodes(uuid, text, int) to authenticated, service_role;
-- @pglite-skip-end

grant select, insert, update, delete on conversations, messages, questions_log to authenticated, service_role;
