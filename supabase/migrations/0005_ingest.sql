-- Sprint 3 — Ingest: pgvector, ingest jobs, review queue, embeddings.
-- Pipeline: raw source → extract text → Claude distills atomic nodes →
-- review_items (human queue) → accept creates real nodes (+ embeddings).

create extension if not exists vector;

create type ingest_source_kind as enum ('paste', 'file', 'url');
create type ingest_status      as enum ('queued', 'extracting', 'distilling', 'ready', 'failed');
create type review_status      as enum ('pending', 'accepted', 'edited', 'rejected');

create table ingest_jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id)   on delete cascade,
  space_id    uuid not null references spaces(id) on delete cascade,
  source_kind ingest_source_kind not null,
  source_uri  text,                     -- filename or URL
  source_text text,                     -- extracted raw text
  status      ingest_status not null default 'queued',
  error       text,
  stats       jsonb not null default '{}'::jsonb,   -- {proposed, dupes, chars}
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table review_items (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references ingest_jobs(id) on delete cascade,
  org_id         uuid not null references orgs(id)   on delete cascade,
  space_id       uuid not null references spaces(id) on delete cascade,
  proposed       jsonb not null,                     -- {title,type,confidence,body_md}
  dup_candidates jsonb not null default '[]'::jsonb, -- [{node_id,title,score}]
  status         review_status not null default 'pending',
  created_node   uuid references nodes(id) on delete set null,
  reviewed_by    uuid references users(id),
  created_at     timestamptz not null default now()
);

create table embeddings (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references nodes(id) on delete cascade,
  org_id     uuid not null references orgs(id)  on delete cascade,
  chunk_ix   int not null default 0,
  content    text not null,
  embedding  vector(384),
  created_at timestamptz not null default now(),
  unique (node_id, chunk_ix)
);

create index ingest_jobs_space_idx  on ingest_jobs(space_id);
create index review_items_job_idx   on review_items(job_id);
create index review_items_space_idx on review_items(space_id);
create index embeddings_node_idx    on embeddings(node_id);
-- Cosine ANN index for Sprint 4 retrieval.
create index embeddings_vec_idx on embeddings using hnsw (embedding vector_cosine_ops);

-- ---------- RLS ----------
alter table ingest_jobs  enable row level security;
alter table review_items enable row level security;
alter table embeddings   enable row level security;

-- Jobs: readable in spaces you can read; created/updated where you can write.
create policy ingest_jobs_select on ingest_jobs for select to authenticated
  using (app.can_read_space(space_id));
create policy ingest_jobs_write on ingest_jobs for all to authenticated
  using (app.can_write_space(space_id))
  with check (app.can_write_space(space_id));

-- Review items: same shape — you review nodes destined for a space you can write.
create policy review_items_select on review_items for select to authenticated
  using (app.can_read_space(space_id));
create policy review_items_write on review_items for all to authenticated
  using (app.can_write_space(space_id))
  with check (app.can_write_space(space_id));

-- Embeddings: follow the parent node.
create policy embeddings_select on embeddings for select to authenticated
  using (app.node_readable(node_id));
create policy embeddings_write on embeddings for all to authenticated
  using (app.node_writable(node_id))
  with check (app.node_writable(node_id));

-- ---------- accept a proposed node ----------
-- SECURITY INVOKER: RLS still requires the caller to be able to write the
-- target space. Reuses create_node (versioning + wikilink resolution).
create or replace function public.accept_review_item(p_item uuid, p_overrides jsonb default '{}'::jsonb)
returns nodes language plpgsql security invoker set search_path = public as $$
declare it review_items; prop jsonb; v nodes;
begin
  select * into it from review_items where id = p_item;    -- RLS: readable?
  if it.id is null then raise exception 'review item not found or not permitted'; end if;
  if it.status <> 'pending' then raise exception 'review item already handled'; end if;

  prop := it.proposed || coalesce(p_overrides, '{}'::jsonb);   -- overrides = "edit then accept"

  v := create_node(
    it.space_id,
    coalesce(prop ->> 'type', 'fact'),
    coalesce(prop ->> 'title', 'Untitled'),
    coalesce(prop ->> 'body_md', ''),
    '{}'::jsonb,
    prop ->> 'confidence',
    'reviewed'::node_status                                    -- human-reviewed
  );

  update review_items
     set status = (case when p_overrides = '{}'::jsonb then 'accepted' else 'edited' end)::review_status,
         created_node = v.id,
         reviewed_by = auth.uid()
   where id = p_item;

  return v;
end;
$$;

grant execute on function public.accept_review_item(uuid, jsonb) to authenticated, service_role;
grant select, insert, update, delete on ingest_jobs, review_items, embeddings to authenticated, service_role;
