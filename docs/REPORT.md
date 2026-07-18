# Collective Brain — Product & Technical Report

A multi-tenant knowledge-graph app for small and medium teams — *your company's
memory, organised and answerable*. Teams pour raw material in; AI distills it
into atomic, linked knowledge; anyone asks questions and gets cited answers
scoped to exactly what they're allowed to see.

| | |
|---|---|
| **Live** | https://collective-brain-two.vercel.app |
| **Status** | Public beta |
| **Hosting** | Vercel + Supabase (Sydney / `ap-southeast-2`) |

---

## 1. At a glance

| Lines of TS | Pages | API routes | DB tables | Migrations | Tests |
|---|---|---|---|---|---|
| ~10,500 | 20 | 29 | 25 | 15 | 132 |

---

## 2. The problem & use cases

Company knowledge lives in heads, chats, and inboxes. When someone leaves, gets
sick, or simply forgets, the answer to "what did we decide about X?" is gone.
Collective Brain turns that scattered material into a permanent, permissioned,
searchable memory.

- **Cited company Q&A** — anyone asks in plain language — *"what payment terms
  did we agree with Acme?"* — and gets a streamed answer citing the exact
  knowledge nodes it came from, with who recorded them and when. If the brain
  doesn't know, it says so and logs the gap.
- **Meeting & document capture** — paste a transcript, upload a file, or drop a
  URL. Claude distills it into **atomic typed nodes** (facts, decisions, SOPs,
  people, clients, projects, ideas) that a human approves before anything
  enters the brain.
- **Channel ingestion** — connect **Slack**, **Gmail** (by label), and
  **Telegram** for scheduled sync; upload **WhatsApp** chat exports. New
  messages flow through the same distill-and-review pipeline.
- **Personal → shared knowledge** — each person has a private brain. When a
  note matures, they **promote** it to a team or company space — with
  owner/admin approval — so knowledge graduates from scratchpad to shared truth.
- **Knowledge health** — maintenance agents produce a weekly digest, flag stale
  nodes, surface unanswered questions, and detect near-duplicates.
- **No lock-in** — any space exports as an **Obsidian-compatible markdown
  vault**; the company's memory is never hostage to the app.

---

## 3. How knowledge flows

```
Capture ──▶ Distill ──▶ Review ──▶ Knowledge ──▶ Ask
paste·file    Claude →     human       nodes +      cited,
URL·connectors  atomic     accepts/    links +      streamed
                nodes      edits       embeddings   answers
```

Two design choices define the pipeline: **a human gate** — nothing enters the
brain without someone accepting it in the Review Queue — and **provenance** —
every node keeps its source, author, timestamps, and full version history.

---

## 4. Functionality

### Capture & organise
- **Typed nodes** — fact, decision, SOP, person, client, project, meeting,
  idea; markdown bodies with `[[wikilinks]]`, autocomplete, backlinks, and
  per-save version history.
- **Ingest** — paste/file/URL → AI distillation → review queue with duplicate
  warnings and bulk high-confidence accept.
- **Connectors** — Slack & Gmail (OAuth), Telegram (bot token), WhatsApp
  (auto-detected chat export); scheduled sync with per-source dedup.

### Retrieve & explore
- **Ask** — hybrid retrieval (vector + keyword, rank-fused, one-hop link
  expansion) feeding a streamed Claude answer with inline `[n]` citations that
  open the source node.
- **Graph** — force-directed view of the whole brain, coloured by type, with
  search, filters, and node preview.
- **Search** — full-text across everything you can read, grouped by type.

### Govern
- **Orgs & members** — magic-link + Google sign-in, email invites with join
  links, roles (owner / admin / member).
- **Spaces** — private, team, and org visibility layers; teams with their own
  shared spaces.
- **Promotions** — request/approve workflow that physically moves a node up the
  visibility ladder.

### Operate
- **Maintenance agents** — weekly digest (emailed to admins), stale scan, gap
  report, duplicate scan; on-demand or scheduled.
- **Usage metering** — every LLM call logged per org with provider, model, and
  USD cost; monthly token and cost caps pause spend automatically.
- **LLM providers** — swappable per org between Anthropic Claude, Kimi
  (Moonshot), and GLM (Zhipu) from an admin settings page, with a
  connection-test button and per-provider pricing.
- **Export** — per-space Obsidian-compatible markdown zip.

---

## 5. Multi-tenancy & security

**The security invariant: permissions are enforced in the database, before any
content reaches the application or the AI model.**

Every one of the 25 tables is default-deny under Postgres Row-Level Security.
Permission logic lives in a hidden `app` schema; two primitives —
`can_read_space` and `can_write_space` — govern everything. Because retrieval
queries run under the asker's own session, the AI can only ever be shown
content that user is allowed to read; there is no app-side filtering to forget.

| Space | Who reads | Who writes | Typical use |
|---|---|---|---|
| **Private** | Owner only | Owner only | Personal notes, drafts |
| **Team** | Team members | Owner/admin (beta) | Departmental knowledge |
| **Org** | Every member | Owner/admin | Company-wide truth |

> **Proven, not promised.** The isolation gate — *two orgs cannot see each
> other's anything* — is locked in by a dedicated RLS test suite that runs the
> production migrations byte-for-byte against an embedded Postgres. Further
> suites cover promotion-approval bypass, invite privileges, connector-token
> secrecy (OAuth tokens are unreadable by *any* signed-in user, including
> owners), and edge-leak prevention in the graph.

Other guarantees: append-only usage log, human review gate on all AI-ingested
content, per-org spend caps, secrets never in the client bundle, and AU data
residency (Supabase Sydney).

---

## 6. Tech stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | Next.js 16 · React 19 · Tailwind 4 | App Router, server components + route handlers, one full-stack TypeScript codebase |
| Database | Supabase Postgres 15 | 25 tables, 15 forward-only migrations, RLS everywhere; auth (magic link + Google) and storage |
| Retrieval | pgvector + Postgres FTS | Hybrid search: HNSW cosine index + tsvector keyword, fused by reciprocal-rank fusion |
| AI | Anthropic Claude · Kimi · GLM | Provider swappable per org via an Anthropic-compatible adapter (default `claude-opus-4-8`); distillation via forced tool-use → structured nodes; streamed cited answers |
| Embeddings | custom 384-dim | Deterministic feature-hash embedder (offline, zero cost) — a single seam to swap for a neural model |
| Graph UI | vis-network | Force-directed canvas of nodes/links, client-only |
| Email | Resend | Invite emails + weekly digest (graceful no-op when unconfigured) |
| Monitoring | Sentry | Server/edge/client error capture, disabled without a DSN |
| Testing | Vitest + PGlite | 132 tests; embedded WASM Postgres runs the real migrations — RLS tested with zero Docker/cloud deps |
| Hosting | Vercel + Supabase Sydney | Auto-deploy from `main`; cron jobs for maintenance + connector sync |

---

## 7. Architecture notes

- **One source of truth** — the same SQL migrations run on cloud Supabase and
  inside the test harness; what's tested is what ships.
- **Human-gated AI** — AI proposes, people approve. Distilled nodes wait in a
  review queue; connector syncs land there too. Nothing self-writes into the
  brain.
- **Swappable seams** — the embedder is one function; the models are env vars;
  connectors implement one small adapter interface. Each can be upgraded
  without touching the rest.
- **Cost discipline** — every LLM call is metered per org (`usage_events`) with
  per-provider pricing rolled up to USD; at the monthly token or cost cap, Ask
  returns 429 and ingest pauses. A public trial can't run away with the bill.
- **Graceful degradation** — without email, Sentry, cron, or connector keys,
  the app still runs; each capability simply switches off with a clear hint
  instead of crashing.

---

## 8. Roadmap

**Shipped:** auth/orgs/invites · nodes/wikilinks/versions · ingest + review ·
cited Ask · graph · promotions · teams · members · maintenance agents +
scheduling · usage + cost caps · swappable LLM providers (Claude/Kimi/GLM) ·
Slack/Gmail/Telegram/WhatsApp connectors · export · Sentry · live deployment.

**Next:** per-org **MCP server** (query the brain from AI assistants) · neural
embedding upgrade for retrieval quality · onboarding wizard · team-lead
privileges · Instagram business inbox · Telegram full-history import.
