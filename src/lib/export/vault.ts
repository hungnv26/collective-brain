import JSZip from "jszip";
import type { Node } from "@/lib/types";

/**
 * Build an Obsidian-compatible markdown vault (zip) for a space. One note per
 * node, filename = title (so [[Title]] wikilinks resolve), with the slug as an
 * alias (so [[slug]] links resolve too). The plan's no-lock-in guarantee.
 */
export async function buildVaultZip(nodes: Node[], spaceName: string): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>();

  for (const node of nodes) {
    const base = sanitizeFilename(node.title) || node.slug || "note";
    let name = base;
    let i = 1;
    while (used.has(name.toLowerCase())) {
      i += 1;
      name = `${base} (${i})`;
    }
    used.add(name.toLowerCase());
    zip.file(`${name}.md`, renderNote(node));
  }

  zip.file(
    "README.md",
    `# ${spaceName}\n\nExported from Collective Brain on ${new Date().toISOString().slice(0, 10)}.\n${nodes.length} note${nodes.length === 1 ? "" : "s"}.\n\nOpen this folder as an Obsidian vault.\n`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

function sanitizeFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|#^[\]]/g, "-") // chars Obsidian/OSes dislike
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
}

function renderNote(node: Node): string {
  const fm: string[] = ["---", `type: ${node.type}`, `status: ${node.status}`];
  if (node.confidence) fm.push(`confidence: ${node.confidence}`);
  fm.push("aliases:", `  - ${node.slug}`);

  const tags = (node.frontmatter?.tags as string[] | undefined) ?? [];
  if (Array.isArray(tags) && tags.length) {
    fm.push("tags:");
    for (const t of tags) fm.push(`  - ${t}`);
  }
  if (node.source_ref) fm.push(`source: ${JSON.stringify(node.source_ref)}`);
  fm.push(`created: ${node.created_at.slice(0, 10)}`, `updated: ${node.updated_at.slice(0, 10)}`, "---", "");

  return `${fm.join("\n")}# ${node.title}\n\n${node.body_md}\n`;
}
