import Link from "next/link";
import { cookies } from "next/headers";
import { getMyOrgs } from "@/lib/data/session";
import { listPendingReviewsByOrg } from "@/lib/data/ingest";
import { ReviewQueue } from "@/components/ingest/ReviewQueue";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const currentOrg = orgs.find((o) => o.id === selected) ?? orgs[0];

  const groups = await listPendingReviewsByOrg(currentOrg.id);
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <p className="text-xs uppercase tracking-wide text-muted">Review queue</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {total} node{total === 1 ? "" : "s"} to review
      </h1>
      <p className="mt-1 text-sm text-muted">
        Distilled from your ingests, across all jobs. Accept, edit, or reject each.
      </p>

      {groups.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <p className="text-sm font-medium">Nothing to review.</p>
          <p className="mt-1 text-sm text-muted">
            <Link href="/ingest" className="underline">
              Ingest
            </Link>{" "}
            a document or transcript and its proposed nodes will queue up here.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map(({ job, items }) => (
            <section key={job.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="truncate text-sm font-medium">{job.source_uri ?? "Pasted source"}</h2>
                <Link href={`/ingest/${job.id}`} className="shrink-0 text-xs text-muted hover:underline">
                  open job →
                </Link>
              </div>
              <ReviewQueue jobId={job.id} items={items} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
