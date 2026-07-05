import { notFound } from "next/navigation";
import { getSpace } from "@/lib/data/nodes";
import { NodeEditor } from "@/components/nodes/NodeEditor";

export const dynamic = "force-dynamic";

export default async function NewNodePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  const space = await getSpace(spaceId);
  if (!space) notFound();
  return <NodeEditor orgId={space.org_id} mode="create" spaceId={space.id} />;
}
