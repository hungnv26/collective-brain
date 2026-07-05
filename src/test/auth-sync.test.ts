import { describe, expect, test } from "vitest";
import { freshDb } from "./db";

describe("auth → public.users sync", () => {
  test("inserting into auth.users mirrors a row into public.users", async () => {
    const db = await freshDb();
    const id = "00000000-0000-4000-8000-aaaaaaaaaaaa";
    await db.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1,$2,$3)",
      [id, "new@user.test", JSON.stringify({ full_name: "New User" })],
    );
    const res = await db.query("select email, name from public.users where id=$1", [id]);
    expect(res.rows[0]).toMatchObject({ email: "new@user.test", name: "New User" });
  });
});
