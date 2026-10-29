import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { createRateLimitResponse } from "../../src/lib/security/rate-limit";

describe("security/rate-limit: PostgreSQL rate_limit_hit counter", () => {
  let db: PGlite;

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
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    `;
    const schemaSql = fs
      .readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf-8")
      .replace(/create extension if not exists "pgcrypto";/i, "");

    await db.exec(supabaseStandIns);
    await db.exec(schemaSql);
  });

  it("allows 10 AI requests in a 60-second window, and the 11th request returns 429 (false)", async () => {
    const bucket = `ai:test-user-${Date.now()}`;
    const windowSeconds = 60;
    const maxHits = 10;

    // Requests 1 through 10 must all be allowed (return true)
    for (let i = 1; i <= 10; i++) {
      const res = await db.query<{ rate_limit_hit: boolean }>(
        `select public.rate_limit_hit($1, $2, $3) as rate_limit_hit;`,
        [bucket, windowSeconds, maxHits],
      );
      expect(res.rows[0].rate_limit_hit).toBe(true);
    }

    // The 11th request in the same window MUST return false
    const eleventh = await db.query<{ rate_limit_hit: boolean }>(
      `select public.rate_limit_hit($1, $2, $3) as rate_limit_hit;`,
      [bucket, windowSeconds, maxHits],
    );
    expect(eleventh.rows[0].rate_limit_hit).toBe(false);

    // The 12th request also returns false
    const twelfth = await db.query<{ rate_limit_hit: boolean }>(
      `select public.rate_limit_hit($1, $2, $3) as rate_limit_hit;`,
      [bucket, windowSeconds, maxHits],
    );
    expect(twelfth.rows[0].rate_limit_hit).toBe(false);
  });

  it("createRateLimitResponse formats standard HTTP 429 with Retry-After header", async () => {
    const response = createRateLimitResponse(60);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Content-Type")).toBe("application/json");

    const json = await response.json();
    expect(json.error).toBe("Too Many Requests");
    expect(json.retryAfter).toBe(60);
  });
});
