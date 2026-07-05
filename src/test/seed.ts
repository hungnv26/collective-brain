import type { Db } from "./db";

export type SeededUser = { id: string; email: string };
export type SeededOrg = {
  id: string;
  owner: SeededUser;
  member: SeededUser;
  outsider: SeededUser; // member of a DIFFERENT org only
  orgSpaceId: string;
  ownerPrivateSpaceId: string;
  memberPrivateSpaceId: string;
  teamId: string;
  teamSpaceId: string;
  orgNodeId: string; // node in the org space
  privateNodeId: string; // node in owner's private space
  teamNodeId: string; // node in the team space
};

let seq = 0;
const uid = () => {
  // deterministic-ish uuids for readable failures
  seq += 1;
  return `00000000-0000-4000-8000-${seq.toString(16).padStart(12, "0")}`;
};

/**
 * Build a fully-populated org using the real security-definer RPCs and
 * privileged seeding, so tests exercise the same code paths as production.
 */
export async function seedOrg(db: Db, label: string): Promise<SeededOrg> {
  const owner = { id: uid(), email: `owner-${label}@x.test` };
  const member = { id: uid(), email: `member-${label}@x.test` };
  const outsider = { id: uid(), email: `outsider-${label}@x.test` };

  // Mirror rows (a trigger does this on real Supabase).
  for (const u of [owner, member, outsider]) {
    await db.query("insert into users (id, email) values ($1,$2)", [u.id, u.email]);
  }

  // Owner creates the org via the RPC (as themselves).
  await setUser(db, owner.id);
  const org = one<{ id: string }>(
    await db.query("select id from create_org($1,$2)", [`Org ${label}`, `org-${label}`]),
  );

  // Fetch the auto-created spaces.
  const orgSpace = one<{ id: string }>(
    await db.query("select id from spaces where org_id=$1 and kind='org'", [org.id]),
  );
  const ownerPrivate = one<{ id: string }>(
    await db.query("select id from spaces where org_id=$1 and kind='private' and owner_user_id=$2", [
      org.id,
      owner.id,
    ]),
  );

  // Add member via invite RPC round-trip.
  const invite = one<{ token: string }>(
    await db.query("select token from create_invite($1,$2,'member')", [org.id, member.email]),
  );
  await setUser(db, member.id);
  await db.query("select 1 from accept_invite($1)", [invite.token]);
  const memberPrivate = one<{ id: string }>(
    await db.query("select id from spaces where org_id=$1 and kind='private' and owner_user_id=$2", [
      org.id,
      member.id,
    ]),
  );

  // Privileged seeding of a team + team space + nodes (bypasses RLS).
  await resetUser(db);
  const team = one<{ id: string }>(
    await db.query("insert into teams (org_id,name) values ($1,'Team') returning id", [org.id]),
  );
  await db.query("insert into team_members (team_id,user_id,is_lead) values ($1,$2,true)", [
    team.id,
    owner.id,
  ]);
  const teamSpace = one<{ id: string }>(
    await db.query("insert into spaces (org_id,kind,team_id,name) values ($1,'team',$2,'Team Space') returning id", [
      org.id,
      team.id,
    ]),
  );

  const orgNode = await seedNode(db, org.id, orgSpace.id, owner.id, `org-note-${label}`);
  const privateNode = await seedNode(db, org.id, ownerPrivate.id, owner.id, `private-note-${label}`);
  const teamNode = await seedNode(db, org.id, teamSpace.id, owner.id, `team-note-${label}`);

  return {
    id: org.id,
    owner,
    member,
    outsider,
    orgSpaceId: orgSpace.id,
    ownerPrivateSpaceId: ownerPrivate.id,
    memberPrivateSpaceId: memberPrivate.id,
    teamId: team.id,
    teamSpaceId: teamSpace.id,
    orgNodeId: orgNode,
    privateNodeId: privateNode,
    teamNodeId: teamNode,
  };
}

async function seedNode(db: Db, orgId: string, spaceId: string, by: string, slug: string) {
  const n = one<{ id: string }>(
    await db.query(
      "insert into nodes (org_id,space_id,type,title,slug,body_md,created_by) values ($1,$2,'fact',$3,$4,'secret',$5) returning id",
      [orgId, spaceId, slug, slug, by],
    ),
  );
  return n.id;
}

async function setUser(db: Db, userId: string) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  await db.exec("set role authenticated");
}
async function resetUser(db: Db) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', '', false)");
}

function one<T>(res: { rows: unknown[] }): T {
  if (!res.rows.length) throw new Error("expected exactly one row, got 0");
  return res.rows[0] as T;
}
