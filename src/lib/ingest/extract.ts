export type SourceKind = "paste" | "file" | "url";

export interface ExtractResult {
  text: string;
  uri?: string;
}

/**
 * Turn a source into plain text ready for distillation.
 * - paste / file: the client already holds the text (files are read as text
 *   client-side and sent inline; binary formats like PDF/DOCX are Sprint 3+).
 * - url: fetch and strip HTML to text.
 */
export async function extractText(
  kind: SourceKind,
  input: { text?: string; url?: string; filename?: string },
): Promise<ExtractResult> {
  if (kind === "url") {
    if (!input.url) throw new Error("url is required");
    const res = await fetch(input.url, { headers: { "user-agent": "CollectiveBrain/0.1" } });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const html = await res.text();
    return { text: stripHtml(html), uri: input.url };
  }
  const text = (input.text ?? "").trim();
  if (!text) throw new Error("No text to ingest");
  return { text, uri: kind === "file" ? input.filename : undefined };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
