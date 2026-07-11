# Deferred scope

Tracked deferrals from the gstack eng review (2026-07-04). These are
intentionally **not** built for beta; the schema/architecture stays compatible
so each is an additive build later.

## Post-beta
- **Onboarding wizard** (multi-step: invite team → first ingest → first ask).
  Beta ships a minimal create-org step only — concierge onboarding covers the
  rest. (D1)
  - **Members / invite admin UI — built**: `/members` (roster + owner/admin
    invite-by-email form with a copyable join link), the `/join?token=` accept
    landing page, and `next`-preservation through login so an invite link
    survives the sign-in bounce. **Email delivery — built** (Resend via `fetch`,
    `RESEND_API_KEY`/`CB_EMAIL_FROM`); best-effort, and no-ops to the copyable
    link when no provider key is set.
- ~~**Graph view** (force-directed, colour by node type, filters).~~ **Built** —
  `/graph`: vis-network force layout over the org's own RLS-scoped nodes/links,
  colour-by-type legend with click-to-filter, node search, info panel. (D1)
- **Team features** — team UI, team space grants, and the `lead` role's
  privileges. Tables (`teams`, `team_members`), the `team` space kind, and the
  `lead` enum value are kept; at beta, team-space writes and promotion approval
  require owner/admin. (D2)
  - **Promotion workflow — built** at the beta scope: `0008_promotions.sql`
    (`request_/approve_/reject_/list_promotions` RPCs), `POST /api/nodes/:id/promote`,
    `POST /api/promotions/:id/approve|reject`, node-view **Promote ↑**, and the
    `/promotions` queue. Approval is gated by `can_write_space(to_space)` → owner/admin
    only (lead approval stays deferred with the rest of D2).
- **Full OCR pipeline** for scanned PDFs. Beta only detects-and-surfaces
  ("looks scanned; OCR needed"). (D12)

## Built this cycle (Sprint 5 polish)
- **Graph view** (`/graph`) — see D1 note above.
- **Promotion workflow** — see D2 note above.
- **Members / invites** incl. email delivery — see D1 note above.
- **Usage metering + cap** — `0009_usage.sql` (`usage_events` + `usage_summary`),
  token recording on Ask + distill, `CB_MONTHLY_TOKEN_CAP` enforcement (Ask 429,
  ingest pause), `GET /api/usage`, and a dashboard usage bar.
- **Demo seed** — `pnpm seed:demo` (`scripts/seed-demo.ts`) populates a demo org
  (nodes/links across spaces + a pending promotion) for dogfooding.

Still open from Sprint 5: Sentry wiring; the deferred onboarding wizard (D1).

## V1
- **Per-user MCP keys** (beta MCP keys, when built, resolve to the org space
  only). (D6)

## Open alignment gaps vs the eng review (not yet built)
See `brain/note/collective-brain-gstack-review-vs-build.md` for the full delta.
Priority: Microsoft/Azure AD OAuth (D16) · embeddings `space_id` denormalisation
+ promotion embedding re-sync (D10) · audited `operator` role (D5) · async ingest
on Inngest (D3) · per-org MCP server (D6/D7) · red-link healing (D9).
