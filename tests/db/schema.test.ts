import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Runs schema.sql against PGlite (real Postgres compiled to WASM) with minimal stand-ins for
 * the Supabase pieces it relies on: auth.users, auth.uid(), and the anon / authenticated /
 * service_role roles with Supabase's default function privileges.
 */

const schemaSql = fs
  .readFileSync(path.resolve(__dirname, "../../schema.sql"), "utf8")
  // gen_random_uuid() is built into Postgres 13+, so the pgcrypto extension is not needed here.
  .replace(/create extension if not exists "pgcrypto";/i, "");

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
  -- Supabase grants these by default on objects created in the public schema.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

let db: PGlite;

const USER_A = "11111111-1111-1111-1111-111111111111";

async function createOccasion(title = "Mum's birthday"): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.occasions (owner_id, title) values ($1, $2) returning id`,
    [USER_A, title],
  );
  return res.rows[0].id;
}

async function createItem(
  occasionId: string,
  title: string,
  extra: { dependsOn?: string[]; fallbackFor?: string } = {},
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into public.plan_items (occasion_id, title, depends_on, fallback_for, is_fallback)
     values ($1, $2, $3::uuid[], $4, $5) returning id`,
    [
      occasionId,
      title,
      extra.dependsOn ?? [],
      extra.fallbackFor ?? null,
      extra.fallbackFor !== undefined,
    ],
  );
  return res.rows[0].id;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(supabaseStandIns);
  await db.exec(schemaSql);
  await db.query(`insert into auth.users (id) values ($1)`, [USER_A]);
});

beforeEach(async () => {
  await db.exec(`reset role;`);
  await db.exec(`
    truncate table public.plan_items, public.occasions, public.vendors, public.recipient_view, public.plan_versions, public.share_links, public.rate_limits cascade;
  `);
});

afterAll(async () => {
  await db.close();
});

describe("plan_items.depends_on integrity", () => {
  it("accepts a dependency on an item in the same occasion", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    const cake = await createItem(occ, "Order cake", { dependsOn: [venue] });
    const row = await db.query<{ depends_on: string[] }>(
      `select depends_on from public.plan_items where id = $1`,
      [cake],
    );
    expect(row.rows[0].depends_on).toEqual([venue]);
  });

  it("accepts a whole plan inserted in one statement in any order (deferred check)", async () => {
    const occ = await createOccasion();
    const a = "aaaaaaaa-0000-0000-0000-000000000001";
    const b = "aaaaaaaa-0000-0000-0000-000000000002";
    await db.query(
      `insert into public.plan_items (id, occasion_id, title, depends_on) values
         ($1, $3, 'Send invites', array[$2]::uuid[]),
         ($2, $3, 'Book venue', '{}')`,
      [a, b, occ],
    );
    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from public.plan_items where occasion_id = $1`,
      [occ],
    );
    expect(count.rows[0].n).toBe(2);
  });

  it("rejects a dependency on an item that belongs to a different occasion", async () => {
    const occ1 = await createOccasion("Mum's birthday");
    const occ2 = await createOccasion("Anniversary");
    const foreign = await createItem(occ2, "Book restaurant");
    await expect(
      createItem(occ1, "Order cake", { dependsOn: [foreign] }),
    ).rejects.toThrow(/same occasion/);
  });

  it("rejects a dependency on an item that does not exist", async () => {
    const occ = await createOccasion();
    await expect(
      createItem(occ, "Order cake", {
        dependsOn: ["99999999-9999-9999-9999-999999999999"],
      }),
    ).rejects.toThrow(/same occasion/);
  });

  it("rejects an item that depends on itself", async () => {
    const occ = await createOccasion();
    const id = "bbbbbbbb-0000-0000-0000-000000000001";
    await expect(
      db.query(
        `insert into public.plan_items (id, occasion_id, title, depends_on)
         values ($1, $2, 'Loop', array[$1]::uuid[])`,
        [id, occ],
      ),
    ).rejects.toThrow(/cannot depend on itself/);
  });

  it("rejects updating depends_on to point at another occasion's item", async () => {
    const occ1 = await createOccasion("Mum's birthday");
    const occ2 = await createOccasion("Anniversary");
    const mine = await createItem(occ1, "Order cake");
    const foreign = await createItem(occ2, "Book restaurant");
    await expect(
      db.query(
        `update public.plan_items set depends_on = array[$2]::uuid[] where id = $1`,
        [mine, foreign],
      ),
    ).rejects.toThrow(/same occasion/);
  });

  it("removes a deleted item's id from dependents instead of leaving it dangling", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    const cake = await createItem(occ, "Order cake", { dependsOn: [venue] });
    await db.query(`delete from public.plan_items where id = $1`, [venue]);
    const row = await db.query<{ depends_on: string[] }>(
      `select depends_on from public.plan_items where id = $1`,
      [cake],
    );
    expect(row.rows[0].depends_on).toEqual([]);
  });

  it("still lets an occasion (and all its items) be deleted", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    await createItem(occ, "Order cake", { dependsOn: [venue] });
    const planB = await createItem(occ, "Home picnic", { fallbackFor: venue });
    expect(planB).toBeTruthy();
    await db.query(`delete from public.occasions where id = $1`, [occ]);
    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from public.plan_items`,
    );
    expect(count.rows[0].n).toBe(0);
  });
});

describe("plan_items.fallback_for integrity", () => {
  it("accepts a fallback that points at an item in the same occasion", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    const planB = await createItem(occ, "Home picnic", { fallbackFor: venue });
    const row = await db.query<{ is_fallback: boolean; fallback_for: string }>(
      `select is_fallback, fallback_for from public.plan_items where id = $1`,
      [planB],
    );
    expect(row.rows[0]).toEqual({ is_fallback: true, fallback_for: venue });
  });

  it("rejects a fallback that points at another occasion's item", async () => {
    const occ1 = await createOccasion("Mum's birthday");
    const occ2 = await createOccasion("Anniversary");
    const foreign = await createItem(occ2, "Book restaurant");
    await expect(
      createItem(occ1, "Home picnic", { fallbackFor: foreign }),
    ).rejects.toThrow(/same occasion/);
  });

  it("rejects an item that is its own fallback", async () => {
    const occ = await createOccasion();
    const id = "cccccccc-0000-0000-0000-000000000001";
    await expect(
      db.query(
        `insert into public.plan_items (id, occasion_id, title, is_fallback, fallback_for)
         values ($1, $2, 'Self', true, $1)`,
        [id, occ],
      ),
    ).rejects.toThrow();
  });

  it("rejects is_fallback that disagrees with fallback_for", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    await expect(
      db.query(
        `insert into public.plan_items (occasion_id, title, is_fallback, fallback_for)
         values ($1, 'Mismatch', false, $2)`,
        [occ, venue],
      ),
    ).rejects.toThrow(/fallback_consistent/);
  });

  it("blocks deleting the original while a Plan B still points at it", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    const planB = await createItem(occ, "Home picnic", { fallbackFor: venue });
    await expect(
      db.query(`delete from public.plan_items where id = $1`, [venue]),
    ).rejects.toThrow(/foreign key|violates/);
    // Both rows and the relationship are untouched.
    const row = await db.query<{ fallback_for: string; is_fallback: boolean }>(
      `select fallback_for, is_fallback from public.plan_items where id = $1`,
      [planB],
    );
    expect(row.rows[0]).toEqual({ fallback_for: venue, is_fallback: true });
  });

  it("allows deleting the original and its Plan B together in one statement", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    const planB = await createItem(occ, "Home picnic", { fallbackFor: venue });
    await db.query(`delete from public.plan_items where id in ($1, $2)`, [venue, planB]);
    const count = await db.query<{ n: number }>(
      `select count(*)::int as n from public.plan_items`,
    );
    expect(count.rows[0].n).toBe(0);
  });

  it("allows deleting a Plan B on its own", async () => {
    const occ = await createOccasion();
    const venue = await createItem(occ, "Book venue");
    const planB = await createItem(occ, "Home picnic", { fallbackFor: venue });
    await db.query(`delete from public.plan_items where id = $1`, [planB]);
    const kept = await db.query<{ n: number }>(
      `select count(*)::int as n from public.plan_items where id = $1`,
      [venue],
    );
    expect(kept.rows[0].n).toBe(1);
  });
});

describe("rate_limit_hit privileges", () => {
  const fn = "public.rate_limit_hit(text,int,int)";

  it("is executable by service_role only", async () => {
    const priv = async (role: string) =>
      (
        await db.query<{ ok: boolean }>(
          `select has_function_privilege($1, '${fn}', 'execute') as ok`,
          [role],
        )
      ).rows[0].ok;

    expect(await priv("service_role")).toBe(true);
    expect(await priv("anon")).toBe(false);
    expect(await priv("authenticated")).toBe(false);
  });

  it("works for service_role: allows up to the limit, then returns false", async () => {
    await db.exec(`set role service_role`);
    const hit = async () =>
      (
        await db.query<{ ok: boolean }>(`select ${fn.replace("(text,int,int)", "")}('ai:user-1', 3600, 2) as ok`)
      ).rows[0].ok;
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(false);
    await db.exec(`reset role`);
  });

  it("rejects calls from the authenticated and anon roles", async () => {
    for (const role of ["authenticated", "anon"]) {
      await db.exec(`set role ${role}`);
      await expect(
        db.query(`select public.rate_limit_hit('ai:user-1', 60, 10)`),
      ).rejects.toThrow(/permission denied/);
      await db.exec(`reset role`);
    }
  });

  it("does not let authenticated or anon read or write the counter table", async () => {
    for (const role of ["authenticated", "anon"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query(`select * from public.rate_limits`)).rejects.toThrow(
        /permission denied/,
      );
      await db.exec(`reset role`);
    }
  });
});
