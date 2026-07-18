-- 0015 — Per-provider cost monitoring. With swappable LLM providers (0014),
-- token counts alone stop being comparable — a Kimi token and an Opus token
-- cost very different amounts. Record which provider served each call and its
-- computed dollar cost, and expose both through the rollup so the dashboard can
-- break spend down by provider and show real $ instead of raw tokens.

alter table usage_events add column provider text;             -- 'anthropic' | 'kimi' | 'glm' | null (legacy rows)
alter table usage_events add column cost_usd numeric(12, 6) not null default 0;

-- Rollup now groups by provider too and sums cost. Replaces the 0009 signature:
-- adds `provider` and `cost_usd` to the returned columns. SECURITY INVOKER, so
-- usage_select still governs which org's rows are visible. Postgres won't let
-- CREATE OR REPLACE change a function's return columns, so drop it first.
drop function if exists public.usage_summary(uuid, timestamptz);

create function public.usage_summary(p_org uuid, p_since timestamptz)
returns table (
  kind text,
  provider text,
  model text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  cost_usd numeric
)
language sql stable security invoker set search_path = public as $$
  select kind,
         coalesce(provider, 'unknown') as provider,
         model,
         count(*)::bigint,
         coalesce(sum(input_tokens), 0)::bigint,
         coalesce(sum(output_tokens), 0)::bigint,
         coalesce(sum(cost_usd), 0)::numeric
  from usage_events
  where org_id = p_org and created_at >= p_since
  group by kind, coalesce(provider, 'unknown'), model
  order by kind, provider, model;
$$;

grant execute on function public.usage_summary(uuid, timestamptz) to authenticated, service_role;
