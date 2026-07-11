"use client";

import { useState } from "react";
import { AGENTS, AGENT_LABEL, type AgentName } from "@/lib/agents/report";

type Report = Record<string, unknown>;
type RunState = { report: Report | null; at: string | null };

const DESCRIPTION: Record<AgentName, string> = {
  digest: "What's new this week, plus totals, open gaps, and stale count.",
  stale: "Marks draft/reviewed nodes untouched for 90+ days as stale.",
  gap: "Questions the brain couldn't answer — candidates to fill.",
  dedupe: "Near-identical nodes by embedding similarity.",
};

export function MaintenancePanel({
  initial,
  isAdmin,
}: {
  initial: Partial<Record<AgentName, { report: Report; created_at: string }>>;
  isAdmin: boolean;
}) {
  const [runs, setRuns] = useState<Record<AgentName, RunState>>(() => {
    const seed = {} as Record<AgentName, RunState>;
    for (const a of AGENTS) seed[a] = { report: initial[a]?.report ?? null, at: initial[a]?.created_at ?? null };
    return seed;
  });
  const [busy, setBusy] = useState<AgentName | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(agent: AgentName) {
    setBusy(agent);
    setError(null);
    const res = await fetch(`/api/agents/${agent}/run`, { method: "POST" });
    setBusy(null);
    if (res.ok) {
      const { report } = await res.json();
      setRuns((r) => ({ ...r, [agent]: { report, at: new Date().toISOString() } }));
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      setError(error || "Could not run this agent.");
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {AGENTS.map((agent) => {
        const { report, at } = runs[agent];
        return (
          <div key={agent} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium">{AGENT_LABEL[agent]}</h2>
                <p className="mt-0.5 text-xs text-muted">{DESCRIPTION[agent]}</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => run(agent)}
                  disabled={busy !== null}
                  className="shrink-0 rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-panel disabled:opacity-50"
                >
                  {busy === agent ? "Running…" : "Run now"}
                </button>
              )}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              {report ? (
                <>
                  <AgentReportView agent={agent} report={report} />
                  {at && (
                    <p className="mt-2 text-xs text-muted/70">
                      Last run {new Date(at).toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted/70">Not run yet.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgentReportView({ agent, report }: { agent: AgentName; report: Report }) {
  if (agent === "digest") {
    const byType = (report.byType ?? {}) as Record<string, number>;
    return (
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Metric label="New this week" value={report.newThisWeek as number} />
        <Metric label="Total nodes" value={report.totalNodes as number} />
        <Metric label="Open gaps" value={report.openGaps as number} />
        <Metric label="Stale" value={report.staleNodes as number} />
        {Object.keys(byType).length > 0 && (
          <p className="w-full text-xs text-muted">
            New by type:{" "}
            {Object.entries(byType)
              .map(([t, n]) => `${t} ${n}`)
              .join(" · ")}
          </p>
        )}
      </div>
    );
  }
  if (agent === "stale") {
    const titles = (report.titles ?? []) as string[];
    return (
      <div className="text-sm">
        <Metric label="Marked stale" value={report.marked as number} />
        {titles.length > 0 && <p className="mt-1 text-xs text-muted">{titles.join(" · ")}</p>}
      </div>
    );
  }
  if (agent === "gap") {
    const qs = (report.questions ?? []) as string[];
    return (
      <div className="text-sm">
        <Metric label="Open gaps" value={report.openGaps as number} />
        {qs.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
            {qs.slice(0, 8).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  // dedupe
  const top = (report.top ?? []) as { titleA: string; titleB: string; score: number }[];
  return (
    <div className="text-sm">
      <Metric label="Duplicate pairs" value={report.pairs as number} />
      {top.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-muted">
          {top.map((p, i) => (
            <li key={i}>
              {p.titleA} ↔ {p.titleB}{" "}
              <span className="text-muted/60">({Math.round(p.score * 100)}%)</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="tabular-nums font-medium">{value ?? 0}</span>{" "}
      <span className="text-muted">{label}</span>
    </span>
  );
}
