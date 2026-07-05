# Collective Brain

Multi-tenant knowledge-graph app for SME teams — *your company's memory,
organised and answerable*. See the product & build plans in the Brain:
`note/collective-brain-product-plan`, `note/collective-brain-sdlc-plan`.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres + RLS) · Claude API
(later sprints) · TypeScript strict · Tailwind 4.

---

## Sprint 1 — Foundation ✅

Delivered:

- **Schema** (`supabase/migrations/0001_schema.sql`) — orgs, users, memberships,
  teams, spaces (private/team/org), space grants, nodes, versions, links,
  invites, promotions.
- **RLS** (`0002_rls.sql`) — every table default-deny. Permission helpers live
  in schema `app` (`can_read_space` / `can_write_space` are the primitives);
  the four bootstrap RPCs (`create_org`, `create_invite`, `accept_invite`,
  `ensure_self`) are in `public`. **Permissions are enforced in the database,
  before any content reaches the app or a model.**
- **Auth sync** (`0003_auth_sync.sql`) — trigger mirrors `auth.users` →
  `public.users`.
- **App** — magic-link + Google login, org-creation wizard with invites, app
  shell (org switcher, nav, space tree), dashboard.
- **Exit gate proven** — `src/test/rls-isolation.test.ts`: two orgs cannot see
  each other's anything (nodes, spaces, memberships, teams, orgs; via count,
  by-PK, and insert/update/delete), plus private/team/org boundaries within an
  org.

### Exit gate

> Two orgs cannot see each other's anything (proven by tests).

```bash
pnpm test          # 12 tests, incl. the RLS isolation suite
pnpm test:rls      # just the isolation gate
```

Tests run against **PGlite** (embedded Postgres) with a Supabase-compatible
`auth` shim, applying the exact migrations that ship to Supabase — no Docker or
cloud project required.

---

## Getting started

```bash
pnpm install
cp .env.example .env.local     # add your Supabase URL + anon key
pnpm dev                       # http://localhost:3000
```

Without `.env.local` the app still boots: it redirects to `/login`, which shows
a setup hint, and API routes return 503.

### With a real Supabase project

1. Create a project (choose the **Sydney / ap-southeast-2** region for AU data
   residency).
2. Apply migrations: `supabase db push` (or paste `supabase/migrations/*.sql`
   into the SQL editor, in order).
3. Enable Email (magic link) and Google auth providers; add
   `http://localhost:3000/auth/callback` as a redirect URL.
4. Put the URL + anon key in `.env.local`.

---

## Sprint 2 — Nodes ✅

- **Node RPCs** (`supabase/migrations/0004_nodes.sql`) — `create_node`,
  `update_node` (snapshots a version each save), `search_nodes` (Postgres
  full-text over a generated `tsvector`), and `app.resolve_wikilinks`
  (rebuilds `related` links from `[[wikilinks]]`). All SECURITY INVOKER, so
  RLS still governs every read/write.
- **App** — space node lists, node view (rendered markdown, type chip,
  status, backlinks + version history panel), the markdown editor with `[[`
  autocomplete and live preview, and full-text search grouped by type.
- **Exit gate** ("usable as a plain team wiki") proven by `src/test/nodes.test.ts`
  and `src/test/wikilinks.test.ts` (create/version/wikilink/backlink/search +
  RLS still enforced). **26 tests pass; clean typecheck and build.**

## Next: Sprint 3 — Ingest

Upload + text extraction, the Claude distillation prompt + eval set, dedupe,
the review queue UI, and embeddings on accept.
