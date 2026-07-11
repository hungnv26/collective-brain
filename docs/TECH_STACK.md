# Collective Brain — Tech Stack

Multi-tenant, permissioned knowledge graph with AI-assisted ingest and cited
Q&A. A single Next.js codebase (frontend + API), Supabase for data/auth, and
Claude for the AI. Full-stack TypeScript.

## At a glance

|                  |                                                                      |
| ---------------- | -------------------------------------------------------------------- |
| **Language**     | TypeScript 5 (strict)                                                |
| **Runtime**      | Node.js 24 · pnpm 11                                                  |
| **Size**         | ~5,250 LOC · 71 TS/TSX files · 12 API routes · 6 SQL migrations · 47 tests |
| **Deploy target**| Vercel + Supabase (Sydney / `ap-southeast-2`)                        |

## Frontend

| Tech | Version | Role |
| --- | --- | --- |
| **Next.js** | 16.2 | App Router, Turbopack, RSC + route handlers, `proxy` (middleware) |
| **React** | 19.2 | Server + client components |
| **Tailwind CSS** | 4 | Styling via `@tailwindcss/postcss`; design tokens (node-type colors, Inter / JetBrains Mono) |
| **react-markdown** + **remark-gfm** | 10 / 4 | Safe markdown rendering (node bodies, answers) with wikilink rewriting |

## Backend & data

| Tech | Version | Role |
| --- | --- | --- |
| **Supabase** | — | Postgres + Auth + Storage |
| **PostgreSQL** | 15 | 15 tables across 6 migrations; enums, triggers, generated columns |
| **Row-Level Security** | — | Default-deny on every table; permission helpers in a hidden `app` schema; `SECURITY INVOKER` / `DEFINER` RPCs. **The security core.** |
| **pgvector** | — | `vector(384)` embeddings + HNSW cosine index |
| **Postgres FTS** | — | `tsvector` generated column + GIN for keyword search |
| **@supabase/ssr** + **supabase-js** | 0.12 / 2.110 | Cookie-based SSR auth clients; magic-link + Google OAuth |
| **Zod** | 4 | Validated API boundaries |

## AI

| Tech | Version | Role |
| --- | --- | --- |
| **@anthropic-ai/sdk** | 0.110 | Claude integration |
| **claude-opus-4-8** | — | Distillation (forced tool-use → structured nodes) + Ask answers (SSE streaming); model configurable via `CB_DISTILL_MODEL` / `CB_ANSWER_MODEL` |
| **Embeddings** | custom | Dependency-free 384-dim feature-hash embedder (deterministic, offline) — pluggable for a neural model |
| **Retrieval** | custom | Hybrid: pgvector + keyword FTS fused via reciprocal-rank fusion + 1-hop link expansion |

## Testing

| Tech | Version | Role |
| --- | --- | --- |
| **Vitest** | 4.1 | 47 tests (8 files) |
| **PGlite** | 0.5.4 | Embedded WASM Postgres — runs the real migrations with a Supabase-compatible `auth` shim, so RLS + RPCs are tested with zero Docker/cloud deps |
| **jszip** | 3.10 | Export zip build + read-back assertions |

Coverage focus: cross-org isolation (the RLS exit gate), node CRUD / versioning /
wikilinks, ingest accept flow, Ask RLS, embed / dedupe, export.

## Tooling / DevOps

- **pnpm** workspace · **ESLint 9** (`eslint-config-next`) · **tsx** for scripts · **dotenv**
- **Supabase CLI** — migrations pushed to cloud with `supabase db push`
- **GitHub** — public repo, `gh` CLI; secrets kept out of tree (`.env.local`, `supabase/.temp/` gitignored)

## Architecture highlights

- **Security invariant** — permissions applied at the database, *before* any content reaches the app or the model.
- **Single source of truth** — SQL migrations run identically on cloud Supabase and the PGlite test harness (with a small pgvector-only shim for tests).
- **No lock-in** — per-space Obsidian-compatible markdown export.
- **Vendor-swappable seams** — the embedder (`embed()`) and the LLM model (env vars) are single points of change.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser + SSR) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged key |
| `ANTHROPIC_API_KEY` | Claude API (ingest + Ask) |
| `CB_DISTILL_MODEL` | Override distillation model (default `claude-opus-4-8`) |
| `CB_ANSWER_MODEL` | Override answer model (default `claude-opus-4-8`) |
| `RESEND_API_KEY` | Transactional email for invites (optional — falls back to a copyable join link) |
| `CB_EMAIL_FROM` | From-address for invite email (default `Collective Brain <onboarding@resend.dev>`) |
| `CB_MONTHLY_TOKEN_CAP` | Per-org monthly Claude token budget (default `5000000`); Ask returns 429 and ingest pauses when reached |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error monitoring (optional — SDK disabled when unset) |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Build-time source-map upload for Sentry (CI only; optional) |
