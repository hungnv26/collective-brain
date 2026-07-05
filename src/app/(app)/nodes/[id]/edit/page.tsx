import { notFound } from "next/navigation";
import { getNode } from "@/lib/data/nodes";
import { NodeEditor } from "@/components/nodes/NodeEditor";

export const dynamic = "force-dynamic";

export default async function EditNodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const node = await getNode(id);
  if (!node) notFound();
  return (
    <NodeEditor
      orgId={node.org_id}
      mode="edit"
      node={{
        id: node.id,
        title: node.title,
        type: node.type,
        body_md: node.body_md,
        status: node.status,
        confidence: node.confidence,
      }}
    />
  );
}
