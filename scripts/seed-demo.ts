/**
 * Seed a demo org so the app is populated for a click-through / dogfooding.
 *
 *   pnpm seed:demo
 *
 * Uses the SERVICE ROLE key, so it bypasses RLS and writes directly (no auth
 * session needed). It creates two auth users, an org with them as owner/admin +
 * member, a handful of typed, wikilinked nodes across org and private spaces,
 * links between them, and one pending promotion.
 *
 * ⚠️ Writes to whatever NEXT_PUBLIC_SUPABASE_URL points at — currently your
 * linked cloud project. Run migrations first (`supabase db push`). Re-running is
 * a no-op if the demo org already exists (matched by slug).
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const SLUG = "demo-co";
const OWNER_EMAIL = "owner@demo.test";
const MEMBER_EMAIL = "member@demo.test";

async function ensureUser(email: string): Promise<string> {
  // Idempotent-ish: try to create; if it exists, look it up by listing.
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) return created.data.user.id;
  const { data } = await db.auth.admin.listUsers();
  const found = data.users.find((u) => u.email === email);
  if (!found) throw new Error(`could not create or find user ${email}`);
  return found.id;
}

async function main() {
  const existing = await db.from("orgs").select("id").eq("slug", SLUG).maybeSingle();
  if (existing.data) {
    console.log(`Demo org "${SLUG}" already exists (${existing.data.id}) — nothing to do.`);
    return;
  }

  const ownerId = await ensureUser(OWNER_EMAIL);
  const memberId = await ensureUser(MEMBER_EMAIL);

  const { data: org } = await db
    .from("orgs")
    .insert({ name: "Demo Co", slug: SLUG, region: "ap-southeast-2", plan: "beta" })
    .select("id")
    .single();
  const orgId = org!.id as string;

  await db.from("memberships").insert([
    { org_id: orgId, user_id: ownerId, role: "owner" },
    { org_id: orgId, user_id: memberId, role: "member" },
  ]);

  const { data: orgSpace } = await db
    .from("spaces")
    .insert({ org_id: orgId, kind: "org", name: "Company" })
    .select("id")
    .single();
  const { data: ownerPriv } = await db
    .from("spaces")
    .insert({ org_id: orgId, kind: "private", owner_user_id: ownerId, name: "My Private Brain" })
    .select("id")
    .single();
  const { data: memberPriv } = await db
    .from("spaces")
    .insert({ org_id: orgId, kind: "private", owner_user_id: memberId, name: "My Private Brain" })
    .select("id")
    .single();

  const orgSpaceId = orgSpace!.id as string;
  const ownerPrivId = ownerPriv!.id as string;
  const memberPrivId = memberPriv!.id as string;

  type Seed = { space: string; type: string; title: string; body: string; by: string };
  const nodes: Seed[] = [
    { space: orgSpaceId, type: "client", title: "Acme Corp", body: "Key account. Renewal handled by [[Jane Okafor]].", by: ownerId },
    { space: orgSpaceId, type: "person", title: "Jane Okafor", body: "Account lead for [[Acme Corp]].", by: ownerId },
    { space: orgSpaceId, type: "fact", title: "Net-30 payment terms", body: "Standard invoicing is net-30. See [[SOP: Monthly invoicing]].", by: ownerId },
    { space: orgSpaceId, type: "sop", title: "SOP: Monthly invoicing", body: "Invoice on the 1st, net-30. Applies to [[Acme Corp]].", by: ownerId },
    { space: orgSpaceId, type: "decision", title: "Renew Acme contract Q3", body: "Approved renewal for [[Acme Corp]] at current pricing.", by: ownerId },
    { space: orgSpaceId, type: "project", title: "Project Atlas", body: "Internal knowledge tooling. Uses [[Atlas uses Postgres + RLS]].", by: ownerId },
    { space: orgSpaceId, type: "fact", title: "Atlas uses Postgres + RLS", body: "Permissions enforced in the database via row-level security.", by: ownerId },
    { space: orgSpaceId, type: "meeting", title: "Sprint retro 2026-06", body: "Discussed [[Project Atlas]] velocity.", by: ownerId },
    { space: ownerPrivId, type: "idea", title: "Self-serve onboarding", body: "Let clients onboard without a call. Contrast with [[SOP: New client onboarding]].", by: ownerId },
    { space: ownerPrivId, type: "sop", title: "SOP: New client onboarding", body: "Kickoff call, then access provisioning.", by: ownerId },
    { space: memberPrivId, type: "decision", title: "Pricing tiers for SMB", body: "Proposed 3 tiers; candidate to promote to the company space.", by: memberId },
  ];

  const idByTitle = new Map<string, string>();
  for (const n of nodes) {
    const slug = n.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const { data } = await db
      .from("nodes")
      .insert({ org_id: orgId, space_id: n.space, type: n.type, title: n.title, slug, body_md: n.body, created_by: n.by, status: "reviewed" })
      .select("id")
      .single();
    idByTitle.set(n.title, data!.id as string);
  }

  const link = (from: string, to: string, rel: string) => ({
    org_id: orgId,
    from_node: idByTitle.get(from)!,
    to_node: idByTitle.get(to)!,
    rel,
  });
  await db.from("links").insert([
    link("Acme Corp", "Jane Okafor", "related"),
    link("Renew Acme contract Q3", "Net-30 payment terms", "supports"),
    link("SOP: Monthly invoicing", "Net-30 payment terms", "extends"),
    link("SOP: Monthly invoicing", "Acme Corp", "related"),
    link("Project Atlas", "Atlas uses Postgres + RLS", "supports"),
    link("Sprint retro 2026-06", "Project Atlas", "related"),
    link("Self-serve onboarding", "SOP: New client onboarding", "contradicts"),
  ]);

  // One pending promotion: member proposes moving their private decision to the org space.
  await db.from("promotions").insert({
    org_id: orgId,
    node_id: idByTitle.get("Pricing tiers for SMB"),
    from_space: memberPrivId,
    to_space: orgSpaceId,
    requested_by: memberId,
    status: "pending",
  });

  console.log(`✔ Seeded demo org "${SLUG}" (${orgId})`);
  console.log(`  Owner:  ${OWNER_EMAIL}`);
  console.log(`  Member: ${MEMBER_EMAIL}`);
  console.log("  Sign in with a magic link to either address to explore.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
