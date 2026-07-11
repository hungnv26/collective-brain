-- 0008 — Promotion workflow (SDLC plan §2c perm/canPromote, promotions/approve).
-- A member proposes moving a node from a space they can write (typically their
-- private brain) into a more-visible team/org space. Approval requires WRITE
-- access to the TARGET space, which at beta means owner/admin (see 0007 / D2:
-- the `lead` role has no write privilege yet). On approval the node is
-- physically moved; embeddings follow via node_readable/node_writable (which
-- key off the node's current space_id), so no re-embed is needed (D10 deferred).
--
-- The `promotions` table + its RLS already ship in 0001/0002. This migration
-- adds the four RPCs that drive the flow.

-- ---------- request ----------
-- SECURITY INVOKER: the insert is governed by the promotions_insert policy
-- (requested_by = auth.uid() AND can_write_space(from_space)), so a caller can
-- only propose promoting a node out of a space they can already write.
create or replace function public.request_promotion(p_node uuid, p_to_space uuid)
returns promotions language plpgsql security invoker set search_path = public as $$
declare v_from uuid; v_org uuid; v_to_org uuid; v_to_kind space_kind; v promotions;
begin
  select space_id, org_id into v_from, v_org from nodes where id = p_node;   -- RLS: readable
  if v_from is null then raise exception 'node not found or not permitted'; end if;

  select org_id, kind into v_to_org, v_to_kind from spaces where id = p_to_space;  -- RLS: readable
  if v_to_org is null then raise exception 'target space not found or not permitted'; end if;
  if v_to_org <> v_org then raise exception 'cannot promote across orgs'; end if;
  if p_to_space = v_from then raise exception 'node is already in that space'; end if;
  if v_to_kind = 'private' then raise exception 'can only promote into a team or org space'; end if;

  if exists (select 1 from promotions where node_id = p_node and status = 'pending') then
    raise exception 'a promotion for this node is already pending';
  end if;

  insert into promotions (org_id, node_id, from_space, to_space, requested_by, status)
  values (v_org, p_node, v_from, p_to_space, auth.uid(), 'pending')
  returning * into v;   -- RLS promotions_insert re-checks requester + can_write_space(from_space)
  return v;
end;
$$;

-- ---------- approve ----------
-- SECURITY DEFINER: moving the node requires touching a source space the
-- approver cannot write (e.g. the requester's private brain), so RLS can't do
-- it as the caller. We therefore bypass RLS but enforce the SAME gate by hand:
-- caller is an org member AND can_write_space(to_space) (owner/admin at beta).
create or replace function public.approve_promotion(p_promotion uuid)
returns promotions language plpgsql security definer set search_path = public as $$
declare v promotions; base text; sl text; i int := 1;
begin
  select * into v from promotions where id = p_promotion for update;
  if v.id is null then raise exception 'promotion not found'; end if;
  if v.status <> 'pending' then raise exception 'promotion already handled'; end if;
  if not app.is_org_member(v.org_id) then raise exception 'not permitted'; end if;
  if not app.can_write_space(v.to_space) then
    raise exception 'not permitted to approve into the target space';
  end if;

  -- Move the node, keeping slug unique within the destination space.
  select slug into base from nodes where id = v.node_id;
  sl := base;
  while exists (select 1 from nodes where space_id = v.to_space and slug = sl and id <> v.node_id) loop
    i := i + 1; sl := base || '-' || i;
  end loop;
  update nodes set space_id = v.to_space, slug = sl, updated_at = now() where id = v.node_id;

  update promotions set status = 'approved', approved_by = auth.uid()
  where id = v.id returning * into v;
  return v;
end;
$$;

-- ---------- reject ----------
-- SECURITY INVOKER: the promotions_update policy (can_write_space(to_space))
-- gates who may reject; a 0-row update means the caller lacked that access.
create or replace function public.reject_promotion(p_promotion uuid)
returns promotions language plpgsql security invoker set search_path = public as $$
declare v promotions;
begin
  update promotions set status = 'rejected', approved_by = auth.uid()
  where id = p_promotion and status = 'pending'
  returning * into v;
  if v.id is null then
    raise exception 'promotion not found, already handled, or not permitted';
  end if;
  return v;
end;
$$;

-- ---------- list (approver + requester view) ----------
-- SECURITY DEFINER with a scoped disclosure: an approver needs to preview a
-- node that still lives in a space they cannot yet read — that preview is the
-- whole point of approval. Rows are returned only to the requester or to
-- someone who can write the target space. `can_approve` tells the UI whether to
-- show the Approve/Reject actions.
create or replace function public.list_promotions(p_org uuid)
returns table (
  id uuid, node_id uuid, node_title text, node_type text, node_body_md text,
  from_space uuid, from_name text, to_space uuid, to_name text, to_kind space_kind,
  requested_by uuid, requester_email text, status promotion_status,
  can_approve boolean, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not app.is_org_member(p_org) then raise exception 'not permitted'; end if;
  return query
    select p.id, p.node_id, n.title, n.type, n.body_md,
           p.from_space, fs.name, p.to_space, ts.name, ts.kind,
           p.requested_by, u.email, p.status,
           app.can_write_space(p.to_space), p.created_at
    from promotions p
    join nodes n   on n.id  = p.node_id
    join spaces fs on fs.id = p.from_space
    join spaces ts on ts.id = p.to_space
    left join users u on u.id = p.requested_by
    where p.org_id = p_org
      and p.status = 'pending'
      and (p.requested_by = auth.uid() or app.can_write_space(p.to_space))
    order by p.created_at desc;
end;
$$;

grant execute on function public.request_promotion(uuid, uuid) to authenticated, service_role;
grant execute on function public.approve_promotion(uuid)       to authenticated, service_role;
grant execute on function public.reject_promotion(uuid)        to authenticated, service_role;
grant execute on function public.list_promotions(uuid)         to authenticated, service_role;
