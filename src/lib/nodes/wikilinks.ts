// Wikilink parsing + rendering. Kept pure and framework-free so it's unit
// tested directly and shared between the editor (autocomplete) and the viewer.

export interface Wikilink {
  raw: string; // the full [[...]] token
  slug: string; // normalised target slug
  label: string; // display text
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** Normalise a wikilink target to the same slug form the DB stores. */
export function slugifyRef(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extract all [[wikilinks]] from a markdown body. Supports [[target|label]]. */
export function parseWikilinks(body: string): Wikilink[] {
  const out: Wikilink[] = [];
  for (const m of body.matchAll(WIKILINK_RE)) {
    const [target, label] = m[1].split("|");
    const slug = slugifyRef(target);
    if (!slug) continue;
    out.push({ raw: m[0], slug, label: (label ?? target).trim() });
  }
  return out;
}

/**
 * Rewrite [[wikilinks]] into standard markdown links so a plain markdown
 * renderer can display them. Resolved targets become internal links to the
 * node; unresolved ones are left as literal [[text]] so they read as broken.
 */
export function renderWikilinksToMarkdown(
  body: string,
  resolve: (slug: string) => { id: string } | null,
): string {
  return body.replace(WIKILINK_RE, (_full, inner: string) => {
    const [target, label] = inner.split("|");
    const slug = slugifyRef(target);
    const text = (label ?? target).trim();
    const hit = slug ? resolve(slug) : null;
    return hit ? `[${text}](/nodes/${hit.id})` : `[[${text}]]`;
  });
}
