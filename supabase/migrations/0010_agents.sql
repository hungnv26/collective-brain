-- 0010 — Maintenance agents (SDLC plan §2c agents/ + §Maintenance). On-demand
-- (later scheduled) jobs that keep the brain healthy: weekly digest, stale scan,
-- knowledge-gap report, duplicate scan. Each run is recorded in agent_runs with
-- its JSON report so the latest result is readable without re-running.

create table agent_runs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  agent      text not null,               -- 'digest' | 'stale' | 'gap' | 'dedupe'
  status     text not null default 'ok',
  report     jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index agent_runs_org_idx on agent_runs(org_id, created_at desc);

alter table agent_runs enable row level security;

-- Org members read the reports; only owner/admin may run an agent (maintenance
-- is an admin action, matching the rest of the beta permission model).
create policy agent_runs_select on agent_runs for select to authenticated
  using (app.is_org_member(org_id));
create policy agent_runs_insert on agent_runs for insert to authenticated
  with check (app.has_org_role(org_id, array['owner','admin']::membership_role[]));

-- Mark old, still-live nodes stale. SECURITY INVOKER, so the update is bounded
-- by RLS to nodes the caller can write (org/team/granted spaces for an admin —
-- never someone else's private brain). Returns the nodes it changed.
create or replace function public.mark_stale_nodes(p_org uuid, p_days int default 90)
returns setof nodes language sql security invoker set search_path = public as $$
  update nodes
     set status = 'stale', updated_at = now()
   where org_id = p_org
     and status in ('draft', 'reviewed')
     and updated_at < now() - (interval '1 day' * p_days)
  returning *;
$$;

grant select, insert on agent_runs to authenticated, service_role;
grant execute on function public.mark_stale_nodes(uuid, int) to authenticated, service_role;
