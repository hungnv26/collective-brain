import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Supabase provides an `auth` schema, an `auth.uid()` helper, and the roles
 * `anon` / `authenticated` / `service_role` out of the box. PGlite does not,
 * so we recreate a faithful-enough shim BEFORE applying the real migrations.
 * The migrations themselves are byte-for-byte what ships to Supabase.
 */
const AUTH_SHIM = `
  create schema if not exists auth;

  -- Minimal stand-in for Supabase's auth.users (exists in prod already), so the
  -- new-user trigger in 0003 has something to attach to under PGlite.
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  -- Reads the JWT 'sub' claim the same way Supabase's auth.uid() does.
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
      ''
    )::uuid;
  $$;

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role bypassrls; end if;
  end $$;

  -- Supabase grants these to the API roles out of the box; SECURITY INVOKER
  -- RPCs (e.g. create_node) call auth.uid() as the authenticated role.
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export type Db = PGlite;

/** Fresh in-memory Postgres with the auth shim + all migrations applied. */
export async function freshDb(): Promise<Db> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(AUTH_SHIM);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await db.exec(pgliteCompat(readFileSync(join(MIGRATIONS_DIR, f), "utf8")));
  }
  return db;
}

/**
 * PGlite 0.5.x doesn't bundle pgvector, but the isolation/accept tests never
 * exercise vector math (that's Sprint 4 retrieval). Rewrite just the pgvector
 * DDL so the schema loads: drop the extension, store embeddings as real[], and
 * skip the ANN index. The real migration is untouched for cloud Supabase.
 */
function pgliteCompat(sql: string): string {
  return sql
    // Drop whole pgvector-only blocks (e.g. the match_nodes RPC using `<=>`).
    .replace(/-- @pglite-skip-begin[\s\S]*?-- @pglite-skip-end/gi, "-- pglite-skipped block")
    .replace(/create extension if not exists vector;/gi, "-- vector extension shimmed for pglite")
    .replace(/\bvector\(384\)/gi, "real[]")
    .replace(/create index \w+ on embeddings using hnsw[^;]*;/gi, "-- hnsw index skipped for pglite");
}

/**
 * Run `fn` as a given authenticated user, inside a transaction, with RLS
 * enforced exactly as it would be for a real Supabase request. Setting the
 * role to `authenticated` (a non-superuser) is what makes the policies apply.
 */
export async function asUser<T>(
  db: Db,
  userId: string,
  fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<T>,
): Promise<T> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await db.exec("set local role authenticated");
    const q = (sql: string, params: unknown[] = []) => db.query(sql, params);
    const result = await fn(q);
    await db.exec("commit");
    return result;
  } catch (err) {
    await db.exec("rollback");
    throw err;
  }
}

/** Run privileged setup/seed as the default superuser (bypasses RLS). */
export async function asAdmin(db: Db, sql: string, params: unknown[] = []) {
  return db.query(sql, params);
}
