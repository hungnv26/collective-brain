-- Sprint 2 — Nodes: full-text search, atomic node RPCs, wikilink resolution.
-- All RPCs are SECURITY INVOKER, so RLS (0002) still governs every read/write —
-- a user can only create/update nodes in spaces they may write, and wikilinks
-- only resolve to nodes they may read.

-- ---------- full-text search ----------
alter table nodes add column search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body_md, '')), 'B')
  ) stored;
create index nodes_search_idx on nodes using gin (search_tsv);

-- ---------- wikilink resolution ----------
-- Rebuilds the auto ('related') links out of [[wikilinks]] in the body. Typed
-- links (supports/contradicts/extends) are managed separately and untouched.
create or replace function app.resolve_wikilinks(p_node uuid, p_org uuid, p_body text)
returns void language plpgsql security invoker set search_path = public as $$
declare raw text; sl text; target uuid;
begin
  delete from links where from_node = p_node and rel = 'related';
  for raw in
    select distinct (regexp_matches(p_body, '\[\[([^\]]+)\]\]', 'g'))[1]
  loop
    -- take the slug part before an optional |label, normalise to slug form
    sl := trim(both '-' from lower(regexp_replace(split_part(raw, '|', 1), '[^a-zA-Z0-9]+', '-', 'g')));
    if sl = '' then continue; end if;
    select n.id into target
      from nodes n
      where n.org_id = p_org and n.slug = sl and n.id <> p_node
      limit 1;                      -- RLS ensures only readable targets resolve
    if target is not null then
      insert into links (org_id, from_node, to_node, rel)
      values (p_org, p_node, target, 'related')
      on conflict (from_node, to_node, rel) do nothing;
    end if;
  end loop;
end;
$$;

-- ---------- create ----------
create or replace function public.create_node(
  p_space uuid,
  p_type text default 'fact',
  p_title text default 'Untitled',
  p_body text default '',
  p_frontmatter jsonb default '{}'::jsonb,
  p_confidence text default null,
  p_status node_status default 'draft'
) returns nodes language plpgsql security invoker set search_path = public as $$
declare v_org uuid; base text; sl text; i int := 1; v nodes;
begin
  select org_id into v_org from spaces where id = p_space;   -- RLS: must be readable
  if v_org is null then raise exception 'space not found or not permitted'; end if;

  base := trim(both '-' from lower(regexp_replace(coalesce(p_title, ''), '[^a-zA-Z0-9]+', '-', 'g')));
  if base = '' then base := 'note'; end if;
  sl := base;
  while exists (select 1 from nodes where space_id = p_space and slug = sl) loop
    i := i + 1; sl := base || '-' || i;
  end loop;

  insert into nodes (org_id, space_id, type, title, slug, body_md, frontmatter, confidence, status, created_by)
  values (v_org, p_space, coalesce(p_type, 'fact'), coalesce(p_title, 'Untitled'), sl,
          coalesce(p_body, ''), coalesce(p_frontmatter, '{}'::jsonb), p_confidence,
          coalesce(p_status, 'draft'), auth.uid())
  returning * into v;                                         -- RLS: must be writable

  insert into node_versions (node_id, org_id, body_md, frontmatter, edited_by)
  values (v.id, v_org, v.body_md, v.frontmatter, auth.uid());

  perform app.resolve_wikilinks(v.id, v_org, v.body_md);
  return v;
end;
$$;

-- ---------- update (snapshots a new version) ----------
create or replace function public.update_node(
  p_id uuid,
  p_title text default null,
  p_body text default null,
  p_frontmatter jsonb default null,
  p_confidence text default null,
  p_status node_status default null
) returns nodes language plpgsql security invoker set search_path = public as $$
declare v_org uuid; v nodes;
begin
  select org_id into v_org from nodes where id = p_id;        -- RLS: readable?
  if v_org is null then raise exception 'node not found or not permitted'; end if;

  update nodes set
    title       = coalesce(p_title, title),
    body_md     = coalesce(p_body, body_md),
    frontmatter = coalesce(p_frontmatter, frontmatter),
    confidence  = coalesce(p_confidence, confidence),
    status      = coalesce(p_status, status),
    updated_at  = now()
  where id = p_id
  returning * into v;                                         -- RLS: writable?
  if not found then raise exception 'update not permitted'; end if;

  insert into node_versions (node_id, org_id, body_md, frontmatter, edited_by)
  values (v.id, v_org, v.body_md, v.frontmatter, auth.uid());

  perform app.resolve_wikilinks(v.id, v_org, v.body_md);
  return v;
end;
$$;

-- ---------- search ----------
create or replace function public.search_nodes(p_org uuid, p_query text)
returns setof nodes language sql stable security invoker set search_path = public as $$
  select n.*
  from nodes n
  where n.org_id = p_org
    and n.search_tsv @@ websearch_to_tsquery('english', p_query)
  order by ts_rank(n.search_tsv, websearch_to_tsquery('english', p_query)) desc
  limit 50;
$$;

-- ---------- grants ----------
grant execute on function app.resolve_wikilinks(uuid, uuid, text) to authenticated, service_role;
grant execute on function
  public.create_node(uuid, text, text, text, jsonb, text, node_status),
  public.update_node(uuid, text, text, jsonb, text, node_status),
  public.search_nodes(uuid, text)
  to authenticated, service_role;
