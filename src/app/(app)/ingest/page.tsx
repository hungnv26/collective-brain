import Link from "next/link";
import { cookies } from "next/headers";
import { getMyOrgs, getVisibleSpaces } from "@/lib/data/session";
import { listJobs } from "@/lib/data/ingest";
import { IngestForm } from "@/components/ingest/IngestForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  extracting: "Extracting",
  distilling: "Distilling",
  ready: "Ready to review",
  failed: "Failed",
};

export default async function IngestPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  const [spaces, jobs] = await Promise.all([getVisibleSpaces(org.id), listJobs(org.id)]);

  // Default to the user's private space if present.
  const privateSpace = spaces.find((s) => s.kind === "private");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Ingest</h1>
      <p className="mt-1 text-sm text-muted">
        Drop in raw material — Claude distills it into atomic nodes for you to review.
      </p>

      <div className="mt-6">
        <IngestForm spaces={spaces} defaultSpaceId={privateSpace?.id} />
      </div>

      {jobs.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent jobs</h2>
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/ingest/${j.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 text-sm hover:border-zinc-400"
                >
                  <span className="capitalize text-muted">{j.source_kind}</span>
                  <span className="flex-1 truncate">{j.source_uri ?? "pasted text"}</span>
                  {typeof j.stats.proposed === "number" && (
                    <span className="text-muted">{j.stats.proposed} proposed</span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      j.status === "ready"
                        ? "bg-emerald-50 text-emerald-700"
                        : j.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-panel text-muted"
                    }`}
                  >
                    {STATUS_LABEL[j.status] ?? j.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
