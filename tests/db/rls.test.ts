/**
 * RLS integration test: two anonymous users, cross-user access denied.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REQUIRES LIVE SUPABASE CREDENTIALS
 * ─────────────────────────────────────────────────────────────────────────────
 * These tests connect to a real Supabase project and verify that RLS policies
 * correctly deny cross-user access for occasions, plan_items, vendors, and
 * plan_versions.
 *
 * They are gated behind an environment flag so that `npm test` passes without
 * any Supabase connection. To run them:
 *
 *   SUPABASE_INTEGRATION_TEST=true npm test
 *
 * Prerequisites:
 *   1. schema.sql applied to your Supabase project.
 *   2. Anonymous sign-ins enabled in the Supabase Auth settings.
 *   3. A .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * The test uses two anonymous sessions (User A and User B) created via
 * signInAnonymously(). It does NOT use the service-role client for data reads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/supabase/database.types";

// Load .env.local into process.env if present
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const RUN = process.env.SUPABASE_INTEGRATION_TEST === "true";

function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/+$/, "");
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

/**
 * Creates a fresh anonymous Supabase client session.
 * Returns [client, userId].
 */
async function signInAnonymous(): Promise<[SupabaseClient<Database>, string]> {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init) => {
        const signal = init?.signal || AbortSignal.timeout(15_000);
        return fetch(input, { ...init, signal, keepalive: false });
      },
    },
  });

  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(`Anonymous sign-in failed: ${error?.message}`);
  }
  return [client, data.user.id];
}

describe.skipIf(!RUN)(
  "RLS: two anonymous users cannot access each other's data",
  { timeout: 60_000 },
  () => {
    let clientA: SupabaseClient<Database>;
    let clientB: SupabaseClient<Database>;
    let userAId: string;

    let occasionAId: string;
    let itemAId: string;
    let vendorAId: string;
    let versionAId: string;

    let liveSupabaseAvailable = false;

    beforeAll(async () => {
      const url = getSupabaseUrl();
      const anonKey = getSupabaseAnonKey();
      if (!url || !anonKey) {
        return;
      }

      try {
        // Create two independent anonymous sessions
        [clientA, userAId] = await signInAnonymous();
        [clientB] = await signInAnonymous();
        liveSupabaseAvailable = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
          console.warn("Live Supabase unreachable (sandbox or offline). Skipping live RLS suite.");
          return;
        }
        throw err;
      }

      // -----------------------------------------------------------------------
      // Set up User A's data
      // -----------------------------------------------------------------------

      // Occasion
      const { data: occ, error: occErr } = await clientA
        .from("occasions")
        .insert({ owner_id: userAId, title: "User A birthday" })
        .select("id")
        .single();
      if (occErr) throw new Error(`Setup failed (occasion): ${occErr.message}`);
      occasionAId = occ.id;

      // Plan item
      const { data: item, error: itemErr } = await clientA
        .from("plan_items")
        .insert({ occasion_id: occasionAId, title: "Book venue" })
        .select("id")
        .single();
      if (itemErr) throw new Error(`Setup failed (plan_item): ${itemErr.message}`);
      itemAId = item.id;

      // Vendor
      const { data: vendor, error: vendorErr } = await clientA
        .from("vendors")
        .insert({ occasion_id: occasionAId, name: "Catering Co", category: "catering" })
        .select("id")
        .single();
      if (vendorErr) throw new Error(`Setup failed (vendor): ${vendorErr.message}`);
      vendorAId = vendor.id;

      // Plan version
      const { data: ver, error: verErr } = await clientA
        .from("plan_versions")
        .insert({
          occasion_id: occasionAId,
          version_no: 1,
          snapshot: { items: [] },
        })
        .select("id")
        .single();
      if (verErr) throw new Error(`Setup failed (plan_version): ${verErr.message}`);
      versionAId = ver.id;
    });

    beforeEach((ctx) => {
      if (!liveSupabaseAvailable) {
        ctx.skip();
      }
    });

    afterAll(async () => {
      // Clean up User A's occasion (cascades to all child tables)
      if (occasionAId && clientA) {
        await clientA.from("occasions").delete().eq("id", occasionAId);
      }
      await clientA?.auth.signOut();
      await clientB?.auth.signOut();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // occasions
    // ─────────────────────────────────────────────────────────────────────────

    it("B cannot SELECT A's occasion", async () => {
      const { data } = await clientB
        .from("occasions")
        .select("id")
        .eq("id", occasionAId);
      expect(data).toEqual([]);
    });

    it("B cannot UPDATE A's occasion", async () => {
      const { error } = await clientB
        .from("occasions")
        .update({ title: "Hacked" })
        .eq("id", occasionAId);
      // RLS blocks the update — either error or 0 rows affected (no error but empty data)
      if (!error) {
        // Confirm the title was NOT changed by reading as A
        const { data } = await clientA
          .from("occasions")
          .select("title")
          .eq("id", occasionAId)
          .single();
        expect(data?.title).toBe("User A birthday");
      }
    });

    it("B cannot DELETE A's occasion", async () => {
      await clientB.from("occasions").delete().eq("id", occasionAId);
      // Verify the occasion still exists
      const { data } = await clientA
        .from("occasions")
        .select("id")
        .eq("id", occasionAId)
        .single();
      expect(data?.id).toBe(occasionAId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // plan_items
    // ─────────────────────────────────────────────────────────────────────────

    it("B cannot SELECT A's plan items", async () => {
      const { data } = await clientB
        .from("plan_items")
        .select("id")
        .eq("occasion_id", occasionAId);
      expect(data).toEqual([]);
    });

    it("B cannot UPDATE A's plan item", async () => {
      await clientB
        .from("plan_items")
        .update({ title: "Hacked" })
        .eq("id", itemAId);
      const { data } = await clientA
        .from("plan_items")
        .select("title")
        .eq("id", itemAId)
        .single();
      expect(data?.title).toBe("Book venue");
    });

    it("B cannot DELETE A's plan item", async () => {
      await clientB.from("plan_items").delete().eq("id", itemAId);
      const { data } = await clientA
        .from("plan_items")
        .select("id")
        .eq("id", itemAId)
        .single();
      expect(data?.id).toBe(itemAId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // vendors
    // ─────────────────────────────────────────────────────────────────────────

    it("B cannot SELECT A's vendors", async () => {
      const { data } = await clientB
        .from("vendors")
        .select("id")
        .eq("occasion_id", occasionAId);
      expect(data).toEqual([]);
    });

    it("B cannot UPDATE A's vendor", async () => {
      await clientB
        .from("vendors")
        .update({ name: "Hacked" })
        .eq("id", vendorAId);
      const { data } = await clientA
        .from("vendors")
        .select("name")
        .eq("id", vendorAId)
        .single();
      expect(data?.name).toBe("Catering Co");
    });

    it("B cannot DELETE A's vendor", async () => {
      await clientB.from("vendors").delete().eq("id", vendorAId);
      const { data } = await clientA
        .from("vendors")
        .select("id")
        .eq("id", vendorAId)
        .single();
      expect(data?.id).toBe(vendorAId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // plan_versions
    // ─────────────────────────────────────────────────────────────────────────

    it("B cannot SELECT A's plan versions", async () => {
      const { data } = await clientB
        .from("plan_versions")
        .select("id")
        .eq("occasion_id", occasionAId);
      expect(data).toEqual([]);
    });

    it("B cannot UPDATE A's plan version", async () => {
      await clientB
        .from("plan_versions")
        .update({ change_summary: "Hacked" })
        .eq("id", versionAId);
      const { data } = await clientA
        .from("plan_versions")
        .select("change_summary")
        .eq("id", versionAId)
        .single();
      expect(data?.change_summary).toBeNull();
    });

    it("B cannot DELETE A's plan version", async () => {
      await clientB.from("plan_versions").delete().eq("id", versionAId);
      const { data } = await clientA
        .from("plan_versions")
        .select("id")
        .eq("id", versionAId)
        .single();
      expect(data?.id).toBe(versionAId);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Negative cases: forged occasion_id and owner_id
    // ─────────────────────────────────────────────────────────────────────────

    it("B cannot INSERT a plan item with a forged occasion_id pointing at A's occasion", async () => {
      const { data, error } = await clientB
        .from("plan_items")
        .insert({
          occasion_id: occasionAId, // forged — A's occasion
          title: "Forged item",
        })
        .select("id");
      // RLS with_check will block this
      expect(error).toBeTruthy();
      expect(data).toBeNull();
    });

    it("B cannot INSERT an occasion with a forged owner_id pointing at A", async () => {
      const { data, error } = await clientB
        .from("occasions")
        .insert({
          owner_id: userAId, // forged — A's user id
          title: "Forged occasion",
        })
        .select("id");
      // RLS with_check (owner_id = auth.uid()) will block this
      expect(error).toBeTruthy();
      expect(data).toBeNull();
    });

    it("B cannot INSERT a vendor with a forged occasion_id pointing at A's occasion", async () => {
      const { data, error } = await clientB
        .from("vendors")
        .insert({
          occasion_id: occasionAId, // forged
          name: "Forged vendor",
          category: "other",
        })
        .select("id");
      expect(error).toBeTruthy();
      expect(data).toBeNull();
    });

    it("B cannot INSERT a plan_version with a forged occasion_id pointing at A's occasion", async () => {
      const { data, error } = await clientB
        .from("plan_versions")
        .insert({
          occasion_id: occasionAId, // forged
          version_no: 99,
          snapshot: {},
        })
        .select("id");
      expect(error).toBeTruthy();
      expect(data).toBeNull();
    });
  },
);
