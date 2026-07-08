-- D2 (gstack eng review 2026-07-04): teams are SCHEMA-ONLY at MVP.
-- Keep the teams / team_members tables, the `team` space kind, and the enum
-- (post-beta team features build on this unchanged), but the `lead` role has
-- NO privileges at beta: writing to / creating a team space, and approving
-- promotions, all require owner/admin. This removes the `is_lead` branches from
-- the two write paths; reads are unchanged (team members can still read).

-- can_write_space: drop the "team lead can write" branch.
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
         or exists (select 1 from space_grants g
                    where g.space_id = s.id and g.access = 'write' and g.user_id = auth.uid())
      )
  );
$$;

-- spaces_insert: drop the "team lead can create a team space" branch.
drop policy if exists spaces_insert on spaces;
create policy spaces_insert on spaces for insert to authenticated
  with check (
    app.is_org_member(org_id) and (
         (kind = 'private' and owner_user_id = auth.uid())
      or app.has_org_role(org_id, array['owner','admin']::membership_role[])
    )
  );
