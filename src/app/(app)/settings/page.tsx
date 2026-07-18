import { cookies } from "next/headers";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/data/org-settings";
import { PROVIDER_IDS, providerLabel, resolveLlmConfig } from "@/lib/ai/provider";
import { LlmSettingsForm } from "@/components/settings/LlmSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];

  const membership = await getMembership(org.id);
  const isAdmin = membership?.role === "owner" || membership?.role === "admin";

  const supabase = await createClient();
  const settings = await getOrgSettings(supabase, org.id);

  const override = settings
    ? { provider: settings.llm_provider, distillModel: settings.distill_model, answerModel: settings.answer_model }
    : null;
  const envDefault = resolveLlmConfig(); // platform default (env-only)
  const effective = resolveLlmConfig(override); // what this org actually uses now

  const providers = PROVIDER_IDS.map((id) => ({ id, label: providerLabel(id) }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted">LLM provider for {org.name}. Powers Ask and ingest distillation.</p>

      <section className="mt-6 rounded-xl border border-border bg-background p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Currently active</h2>
        <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Provider</dt>
            <dd className="mt-0.5">{providerLabel(effective.provider)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ask model</dt>
            <dd className="mt-0.5 font-mono text-xs">{effective.answerModel}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Distill model</dt>
            <dd className="mt-0.5 font-mono text-xs">{effective.distillModel}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          {override?.provider
            ? "Set by this org's override below."
            : `Using the platform default (${providerLabel(envDefault.provider)}). No org override set.`}
        </p>
      </section>

      {isAdmin ? (
        <div className="mt-6">
          <LlmSettingsForm
            providers={providers}
            envDefault={envDefault}
            initial={override}
          />
          <p className="mt-3 text-xs text-muted">
            API keys live in server environment, not here — a provider you can&apos;t test yet needs its
            key set in the deployment. Leave model fields blank to use the platform default for that
            provider.
          </p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Only owners and admins can change the LLM provider.</p>
      )}
    </div>
  );
}
