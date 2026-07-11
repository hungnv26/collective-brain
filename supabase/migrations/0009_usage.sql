-- 0009 — Usage metering (SDLC plan §2c billing/meterUsage, enforceCap + §NFR
-- "per-org Claude spend metered and capped"). Append-only event log of every
-- billable model call (Ask answers, ingest distillation), plus a rollup RPC the
-- dashboard and the cap check read. Embeddings are local (feature-hash) and cost
-- no tokens, so they're not metered.

create table usage_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id)  on delete cascade,
  user_id       uuid references users(id)          on delete set null,
  kind          text not null,          -- 'ask' | 'distill'
  model         text not null,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  created_at    timestamptz not null default now()
);
create index usage_events_org_idx on usage_events(org_id, created_at);

alter table usage_events enable row level security;

-- Any org member may read their org's usage; events are written server-side but
-- an org member inserting their own org's event is also allowed. Append-only:
-- no update/delete policy, so the log can't be rewritten.
create policy usage_select on usage_events for select to authenticated
  using (app.is_org_member(org_id));
create policy usage_insert on usage_events for insert to authenticated
  with check (app.is_org_member(org_id));

-- Rollup: totals since a timestamp, grouped by kind + model. SECURITY INVOKER,
-- so usage_select still governs which org's rows are visible.
create or replace function public.usage_summary(p_org uuid, p_since timestamptz)
returns table (kind text, model text, calls bigint, input_tokens bigint, output_tokens bigint)
language sql stable security invoker set search_path = public as $$
  select kind, model, count(*)::bigint,
         coalesce(sum(input_tokens), 0)::bigint,
         coalesce(sum(output_tokens), 0)::bigint
  from usage_events
  where org_id = p_org and created_at >= p_since
  group by kind, model
  order by kind, model;
$$;

grant select, insert on usage_events to authenticated, service_role;
grant execute on function public.usage_summary(uuid, timestamptz) to authenticated, service_role;
