-- 0012 — Make accept_invite idempotent for the private space.
-- accept_invite inserted a "My Private Brain" space UNCONDITIONALLY, so if it
-- ran more than once for a user in an org (e.g. a retried accept), it created a
-- duplicate private brain. The membership insert was already guarded with
-- ON CONFLICT DO NOTHING; this brings the space insert in line — only create the
-- private brain if the user doesn't already have one in that org. Body otherwise
-- unchanged.
create or replace function public.accept_invite(p_token text)
returns orgs language plpgsql security definer set search_path = public as $$
declare v_inv invites; v_org orgs; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_inv from invites
    where token = p_token and status = 'pending' and expires_at > now();
  if not found then raise exception 'invalid or expired invite'; end if;

  insert into memberships (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;

  -- Only provision a private brain if they don't already have one here.
  if not exists (
    select 1 from spaces
    where org_id = v_inv.org_id and kind = 'private' and owner_user_id = v_uid
  ) then
    insert into spaces (org_id, kind, owner_user_id, name)
    values (v_inv.org_id, 'private', v_uid, 'My Private Brain');
  end if;

  update invites set status = 'accepted' where id = v_inv.id;
  select * into v_org from orgs where id = v_inv.org_id;
  return v_org;
end;
$$;
