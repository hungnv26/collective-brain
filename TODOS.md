# Deferred scope

Tracked deferrals from the gstack eng review (2026-07-04). These are
intentionally **not** built for beta; the schema/architecture stays compatible
so each is an additive build later.

## Post-beta
- **Onboarding wizard** (multi-step: invite team → first ingest → first ask).
  Beta ships a minimal create-org step only — concierge onboarding covers the
  rest. (D1)
- **Graph view** (force-directed, colour by node type, filters). No beta evidence
  anyone needs it. (D1)
- **Team features** — team UI, team space grants, and the `lead` role's
  privileges. Tables (`teams`, `team_members`), the `team` space kind, and the
  `lead` enum value are kept; at beta, team-space writes and promotion approval
  require owner/admin. (D2)
- **Full OCR pipeline** for scanned PDFs. Beta only detects-and-surfaces
  ("looks scanned; OCR needed"). (D12)

## V1
- **Per-user MCP keys** (beta MCP keys, when built, resolve to the org space
  only). (D6)

## Open alignment gaps vs the eng review (not yet built)
See `brain/note/collective-brain-gstack-review-vs-build.md` for the full delta.
Priority: Microsoft/Azure AD OAuth (D16) · embeddings `space_id` denormalisation
+ promotion embedding re-sync (D10) · audited `operator` role (D5) · async ingest
on Inngest (D3) · per-org MCP server (D6/D7) · red-link healing (D9).
