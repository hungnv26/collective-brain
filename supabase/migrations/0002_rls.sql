-- Collective Brain — RLS policies + permission helpers (Sprint 1)
-- SECURITY INVARIANT (plan §Architecture): permissions are enforced in the DB,
-- before any content reaches the application or a model. Every table is
-- default-deny; access flows only through the helpers below.
--
-- Helpers live in schema `app`, are SECURITY DEFINER, and are owned by the
-- migration role (postgres) which has BYPASSRLS — so a helper can read
-- memberships/spaces without recursively triggering the very policies that
-- call it. This is the standard Supabase pattern.

create schema if not exists app;

-- ---------- permission primitives ----------

-- Is the current user a member of this org?
create or replace function app.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = p_org and m.user_id = auth.uid()
  );
$$;

-- Does the current user hold one of these roles in the org?
create or replace function app.has_org_role(p_org uuid, p_roles membership_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = any(p_roles)
  );
$$;

-- THE read primitive: can the current user read this space?
-- (private → owner; org → any org member; team → team member;
--  plus explicit user/team space_grants. Always gated on org membership.)
create or replace function app.can_read_space(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from spaces s
    where s.id = p_space
      and exists (select 1 from memberships m
                  where m.org_id = s.org_id and m.user_id = auth.uid())
      and (
            (s.kind = 'private' and s.owner_user_id = auth.uid())
         or (s.kind = 'org')
         or (s.kind = 'team' and exists (select 1 from team_members tm
                                         where tm.team_id = s.team_id and tm.user_id = auth.uid()))
         or exists (select 1 from space_grants g
                    where g.space_id = s.id and g.user_id = auth.uid())
         or exists (select 1 from space_grants g
                    join team_members tm on tm.team_id = g.team_id
                    where g.space_id = s.id and tm.user_id = auth.uid())
      )
  );
$$;

-- THE write primitive.
create or replace function app.can_write_space(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from spaces s
    where s.id = p_space
      and exists (select 1 from memberships m
                  where m.org_id = s.org_id and m.user_id = auth.uid())
      and (
            (s.kind = 'private' and s.owner_user_id = auth.uid())
         or app.has_org_role(s.org_id, array['owner','admin']::membership_role[])
         or (s.kind = 'team' and exists (select 1 from team_members tm
                                         where tm.team_id = s.team_id
                                           and tm.user_id = auth.uid() and tm.is_lead))
         or exists (select 1 from space_grants g
                    where g.space_id = s.id and g.access = 'write' and g.user_id = auth.uid())
         or exists (select 1 from space_grants g
                    join team_members tm on tm.team_id = g.team_id
                    where g.space_id = s.id and g.access = 'write' and tm.user_id = auth.uid())
      )
  );
$$;

create or replace function app.can_manage_space(p_space uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from spaces s
    where s.id = p_space and (
          (s.kind = 'private' and s.owner_user_id = auth.uid())
       or app.has_org_role(s.org_id, array['owner','admin']::membership_role[])
    )
  );
$$;

create or replace function app.node_readable(p_node uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from nodes n where n.id = p_node and app.can_read_space(n.space_id));
$$;

create or replace function app.node_writable(p_node uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from nodes n where n.id = p_node and app.can_write_space(n.space_id));
$$;

create or replace function app.team_in_my_org(p_team uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from teams t
    join memberships m on m.org_id = t.org_id
    where t.id = p_team and m.user_id = auth.uid()
  );
$$;

-- ---------- enable RLS (default-deny) ----------
alter table orgs          enable row level security;
alter table users         enable row level security;
alter table memberships   enable row level security;
alter table teams         enable row level security;
alter table team_members  enable row level security;
alter table spaces        enable row level security;
alter table space_grants  enable row level security;
alter table nodes         enable row level security;
alter table node_versions enable row level security;
alter table links         enable row level security;
alter table invites       enable row level security;
alter table promotions    enable row level security;

-- ---------- policies ----------

-- orgs: members read; creation only via app.create_org(); admins/owners update.
create policy orgs_select on orgs for select to authenticated
  using (app.is_org_member(id));
create policy orgs_update on orgs for update to authenticated
  using (app.has_org_role(id, array['owner','admin']::membership_role[]))
  with check (app.has_org_role(id, array['owner','admin']::membership_role[]));

-- users: a user sees their own row and rows of co-members in shared orgs.
create policy users_select_self on users for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from memberships me
      join memberships them on them.org_id = me.org_id
      where me.user_id = auth.uid() and them.user_id = users.id
    )
  );
create policy users_upsert_self on users for insert to authenticated
  with check (id = auth.uid());
create policy users_update_self on users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships: see co-members; admins/owners manage.
create policy memberships_select on memberships for select to authenticated
  using (app.is_org_member(org_id));
create policy memberships_manage on memberships for all to authenticated
  using (app.has_org_role(org_id, array['owner','admin']::membership_role[]))
  with check (app.has_org_role(org_id, array['owner','admin']::membership_role[]));

-- teams: members read; admins/owners manage.
create policy teams_select on teams for select to authenticated
  using (app.is_org_member(org_id));
create policy teams_manage on teams for all to authenticated
  using (app.has_org_role(org_id, array['owner','admin']::membership_role[]))
  with check (app.has_org_role(org_id, array['owner','admin']::membership_role[]));

-- team_members: visible within the org; admins/owners manage.
create policy team_members_select on team_members for select to authenticated
  using (app.team_in_my_org(team_id));
create policy team_members_manage on team_members for all to authenticated
  using (exists (select 1 from teams t
                 where t.id = team_id
                   and app.has_org_role(t.org_id, array['owner','admin']::membership_role[])))
  with check (exists (select 1 from teams t
                 where t.id = team_id
                   and app.has_org_role(t.org_id, array['owner','admin']::membership_role[])));

-- spaces: read via the read primitive; create own private / lead team / admin any.
create policy spaces_select on spaces for select to authenticated
  using (app.can_read_space(id));
create policy spaces_insert on spaces for insert to authenticated
  with check (
    app.is_org_member(org_id) and (
         (kind = 'private' and owner_user_id = auth.uid())
      or (kind = 'team' and exists (select 1 from team_members tm
                                    where tm.team_id = spaces.team_id
                                      and tm.user_id = auth.uid() and tm.is_lead))
      or app.has_org_role(org_id, array['owner','admin']::membership_role[])
    )
  );
create policy spaces_update on spaces for update to authenticated
  using (app.can_manage_space(id)) with check (app.can_manage_space(id));
create policy spaces_delete on spaces for delete to authenticated
  using (app.can_manage_space(id));

-- space_grants: visible to org members; managed by space managers.
create policy space_grants_select on space_grants for select to authenticated
  using (app.can_read_space(space_id));
create policy space_grants_manage on space_grants for all to authenticated
  using (app.can_manage_space(space_id))
  with check (app.can_manage_space(space_id));

-- nodes: the content table — read/write gated entirely by space.
create policy nodes_select on nodes for select to authenticated
  using (app.can_read_space(space_id));
create policy nodes_insert on nodes for insert to authenticated
  with check (app.can_write_space(space_id)
              and org_id = (select s.org_id from spaces s where s.id = space_id));
create policy nodes_update on nodes for update to authenticated
  using (app.can_write_space(space_id)) with check (app.can_write_space(space_id));
create policy nodes_delete on nodes for delete to authenticated
  using (app.can_write_space(space_id));

-- node_versions: follow the parent node.
create policy node_versions_select on node_versions for select to authenticated
  using (app.node_readable(node_id));
create policy node_versions_insert on node_versions for insert to authenticated
  with check (app.node_writable(node_id));

-- links: read if source node readable; write if source node writable.
create policy links_select on links for select to authenticated
  using (app.node_readable(from_node));
create policy links_insert on links for insert to authenticated
  with check (app.node_writable(from_node) and app.node_readable(to_node));
create policy links_delete on links for delete to authenticated
  using (app.node_writable(from_node));

-- invites: only admins/owners of the org see or manage them.
create policy invites_select on invites for select to authenticated
  using (app.has_org_role(org_id, array['owner','admin']::membership_role[]));
create policy invites_manage on invites for all to authenticated
  using (app.has_org_role(org_id, array['owner','admin']::membership_role[]))
  with check (app.has_org_role(org_id, array['owner','admin']::membership_role[]));

-- promotions: org members see; requester must be able to write source.
create policy promotions_select on promotions for select to authenticated
  using (app.is_org_member(org_id));
create policy promotions_insert on promotions for insert to authenticated
  with check (requested_by = auth.uid() and app.can_write_space(from_space));
create policy promotions_update on promotions for update to authenticated
  using (app.can_write_space(to_space)) with check (app.can_write_space(to_space));

-- ---------- RPCs for bootstrap flows (default-deny tables need a trusted path) ----------

-- These four entry points are the ONLY writes to default-deny tables that the
-- app performs directly; they live in `public` so PostgREST exposes them as
-- RPCs. The permission helpers above stay in `app` (unexposed).

-- Upsert the caller's mirror row in public.users (called right after sign-in).
create or replace function public.ensure_self(p_email text, p_name text default null, p_avatar text default null)
returns users language plpgsql security definer set search_path = public as $$
declare v users;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into users (id, email, name, avatar_url)
  values (auth.uid(), p_email, p_name, p_avatar)
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(excluded.name, users.name),
        avatar_url = coalesce(excluded.avatar_url, users.avatar_url)
  returning * into v;
  return v;
end;
$$;

-- Create an org + owner membership + default org space + caller's private brain.
create or replace function public.create_org(p_name text, p_slug text)
returns orgs language plpgsql security definer set search_path = public as $$
declare v_org orgs; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into orgs (name, slug) values (p_name, p_slug) returning * into v_org;
  insert into memberships (org_id, user_id, role) values (v_org.id, v_uid, 'owner');
  insert into spaces (org_id, kind, name) values (v_org.id, 'org', v_org.name);
  insert into spaces (org_id, kind, owner_user_id, name)
    values (v_org.id, 'private', v_uid, 'My Private Brain');
  return v_org;
end;
$$;

-- Create an invite (admins/owners only).
create or replace function public.create_invite(p_org uuid, p_email text, p_role membership_role default 'member')
returns invites language plpgsql security definer set search_path = public as $$
declare v invites;
begin
  if not app.has_org_role(p_org, array['owner','admin']::membership_role[]) then
    raise exception 'insufficient privileges';
  end if;
  insert into invites (org_id, email, role, token, invited_by)
  values (p_org, p_email, p_role, encode(gen_random_bytes(18), 'hex'), auth.uid())
  returning * into v;
  return v;
end;
$$;

-- Accept an invite: creates membership + the new member's private brain.
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

  insert into spaces (org_id, kind, owner_user_id, name)
  values (v_inv.org_id, 'private', v_uid, 'My Private Brain');

  update invites set status = 'accepted' where id = v_inv.id;
  select * into v_org from orgs where id = v_inv.org_id;
  return v_org;
end;
$$;

-- ---------- grants ----------
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;
grant usage on schema public to authenticated, anon, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
-- the four public RPC entry points
grant execute on function
  public.ensure_self(text, text, text),
  public.create_org(text, text),
  public.create_invite(uuid, text, membership_role),
  public.accept_invite(text)
  to authenticated, service_role;
