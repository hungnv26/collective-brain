// Embeddings. Sprint 3 uses a dependency-free feature-hashing embedder:
// deterministic, offline, no extra API key, and — because it hashes token
// unigrams into signed buckets — its cosine similarity tracks lexical overlap,
// which is enough for dedupe and a reasonable placeholder for retrieval.
// Swappable later for a neural model (Voyage / local transformers) behind the
// same `embed()` signature without touching callers.

export const EMBED_DIM = 384;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2);
}

// FNV-1a
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 384-dim unit vector for a piece of text. */
export function embed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  for (const tok of tokenize(text)) {
    const h = hash(tok);
    const idx = h % EMBED_DIM;
    v[idx] += (h >>> 16) & 1 ? 1 : -1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Cosine similarity of two unit vectors (dot product). */
export function cosine(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length && i < b.length; i++) d += a[i] * b[i];
  return d;
}

/** Format a vector for a pgvector column (PostgREST expects a "[..]" string). */
export function toPgVector(v: number[]): string {
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`;
}

/** Parse a pgvector string back into numbers. */
export function fromPgVector(s: string | number[]): number[] {
  if (Array.isArray(s)) return s;
  return s.replace(/^\[|\]$/g, "").split(",").map(Number);
}
