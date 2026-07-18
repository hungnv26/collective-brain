-- 0014 — Per-org LLM provider settings. Lets an owner/admin override the
-- platform env default (CB_LLM_PROVIDER + model env vars) for their org, so a
-- team can run Ask + distillation on Anthropic, Kimi (Moonshot), or GLM (Zhipu)
-- without a redeploy. API keys stay in server env — only the *choice* of
-- provider + model ids live here. NULL columns mean "fall back to the env default".

create table org_settings (
  org_id        uuid primary key references orgs(id) on delete cascade,
  llm_provider  text,                                 -- 'anthropic' | 'kimi' | 'glm' | null
  distill_model text,
  answer_model  text,
  updated_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  constraint org_settings_provider_chk
    check (llm_provider is null or llm_provider in ('anthropic', 'kimi', 'glm'))
);

alter table org_settings enable row level security;

-- Any org member may read their org's settings (the app resolves the provider
-- for every Ask/ingest). Only owners/admins may change them.
create policy org_settings_select on org_settings for select to authenticated
  using (app.is_org_member(org_id));
create policy org_settings_manage on org_settings for all to authenticated
  using (app.has_org_role(org_id, array['owner','admin']::membership_role[]))
  with check (app.has_org_role(org_id, array['owner','admin']::membership_role[]));

grant select, insert, update, delete on org_settings to authenticated, service_role;
