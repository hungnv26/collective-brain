import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob, listPendingReviewItems } from "@/lib/data/ingest";
import { getSpace } from "@/lib/data/nodes";
import { ReviewQueue } from "@/components/ingest/ReviewQueue";

export const dynamic = "force-dynamic";

export default async function ReviewJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) notFound();
  const [items, space] = await Promise.all([listPendingReviewItems(jobId), getSpace(job.space_id)]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Review queue</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {job.source_uri ?? "Pasted source"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Accepted nodes land in <Link href={`/spaces/${job.space_id}`} className="underline">{space?.name ?? "the space"}</Link>.
            {typeof job.stats.dupes === "number" && job.stats.dupes > 0 && ` ${job.stats.dupes} possible duplicate(s) flagged.`}
          </p>
        </div>
      </div>

      {job.status === "failed" ? (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Ingest failed: {job.error ?? "unknown error"}
        </div>
      ) : (
        <div className="mt-6">
          <ReviewQueue jobId={job.id} items={items} />
        </div>
      )}
    </div>
  );
}
