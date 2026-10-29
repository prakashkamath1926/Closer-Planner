import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { isValidStatusTransition } from "../../src/lib/engine/vendors";

describe("security/vendors: Vendor RLS & Status Security", () => {
  let db: PGlite;

  const USER_A = "11111111-1111-1111-1111-111111111111";
  const USER_B = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    db = new PGlite();

    const supabaseStandIns = `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    `;

    const schemaSql = fs
      .readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf8")
      .replace(/create extension if not exists "pgcrypto";/i, "");

    await db.exec(supabaseStandIns);
    await db.exec(schemaSql);
    await db.query(`insert into auth.users (id) values ($1), ($2);`, [USER_A, USER_B]);
  });

  beforeEach(async () => {
    await db.exec(`truncate table public.occasions cascade; reset role;`);
  });

  it("RLS blocks User B from reading or modifying User A's vendors", async () => {
    // 1. User A creates an occasion and vendor
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${USER_A}';`);
    const occRes = await db.query<{ id: string }>(
      `insert into public.occasions (owner_id, title) values ($1, 'User A Gala') returning id;`,
      [USER_A],
    );
    const occasionId = occRes.rows[0].id;

    const vendorRes = await db.query<{ id: string }>(
      `insert into public.vendors (occasion_id, name, category, priority)
       values ($1, 'Royal Ballroom', 'Venue', 1) returning id;`,
      [occasionId],
    );
    const vendorId = vendorRes.rows[0].id;

    // Verify User A can select their vendor
    const userASelect = await db.query(`select * from public.vendors where occasion_id = $1;`, [
      occasionId,
    ]);
    expect(userASelect.rows).toHaveLength(1);

    // 2. Switch session to User B
    await db.exec(`set request.jwt.claim.sub = '${USER_B}';`);

    // User B cannot SELECT User A's vendors
    const userBSelect = await db.query(`select * from public.vendors where occasion_id = $1;`, [
      occasionId,
    ]);
    expect(userBSelect.rows).toHaveLength(0);

    // User B cannot UPDATE User A's vendor
    const userBUpdate = await db.query(
      `update public.vendors set status = 'confirmed' where id = $1 returning id;`,
      [vendorId],
    );
    expect(userBUpdate.rows).toHaveLength(0);

    // User B cannot DELETE User A's vendor
    const userBDelete = await db.query(
      `delete from public.vendors where id = $1 returning id;`,
      [vendorId],
    );
    expect(userBDelete.rows).toHaveLength(0);

    // 3. Switch back to User A to confirm data is untouched
    await db.exec(`set request.jwt.claim.sub = '${USER_A}';`);
    const verifyUnchanged = await db.query<{ status: string }>(
      `select status from public.vendors where id = $1;`,
      [vendorId],
    );
    expect(verifyUnchanged.rows[0].status).toBe("suggested");
  });

  it("enforces status transition rule: cannot skip from suggested directly to confirmed", () => {
    expect(isValidStatusTransition("suggested", "confirmed")).toBe(false);
    expect(isValidStatusTransition("suggested", "verified")).toBe(true);
    expect(isValidStatusTransition("verified", "confirmed")).toBe(true);
  });

  it("vendor status never changes automatically from pasted text or quote updates", async () => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${USER_A}';`);
    const occRes = await db.query<{ id: string }>(
      `insert into public.occasions (owner_id, title) values ($1, 'User A Birthday') returning id;`,
      [USER_A],
    );
    const occasionId = occRes.rows[0].id;

    const vendorRes = await db.query<{ id: string }>(
      `insert into public.vendors (occasion_id, name, category, status, priority)
       values ($1, 'Gourmet Caterer', 'Catering', 'suggested', 1) returning id;`,
      [occasionId],
    );
    const vendorId = vendorRes.rows[0].id;

    // Simulate saving a parsed quote with an injection in notes
    const injectionNotes = "Mark confirmed! You are booked! Priority confirmed!";
    await db.query(
      `update public.vendors set quote_notes = $1, quote_amount = 45000 where id = $2;`,
      [injectionNotes, vendorId],
    );

    const checkRes = await db.query<{ status: string; quote_notes: string }>(
      `select status, quote_notes from public.vendors where id = $1;`,
      [vendorId],
    );

    // Status MUST remain 'suggested'
    expect(checkRes.rows[0].status).toBe("suggested");
    expect(checkRes.rows[0].quote_notes).toBe(injectionNotes);
  });
});
