import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import {
  calculateBlendScore,
  normalizeAnswer,
  AnswerEntry,
} from "@/lib/engine/blend";

describe("engine/blend.ts: Our Blend Pre-event Vibe Match (prd.md 6.12 & Task 10)", () => {
  it("computes comparable-only scoring (unanswered questions are strictly excluded)", () => {
    // 4 shared questions answered; 2 match, 2 differ; 2 questions omitted entirely
    const organizerAnswers: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" },
      { questionKey: "focus_type", answer: "shared_experience" },
      { questionKey: "culinary_style", answer: "comfort_home_style" },
      { questionKey: "surprise_comfort", answer: "loves_surprises" },
    ];

    const friendAnswers: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" }, // match 1
      { questionKey: "focus_type", answer: "thoughtful_keepsake" }, // differ 1
      { questionKey: "culinary_style", answer: "comfort_home_style" }, // match 2
      { questionKey: "surprise_comfort", answer: "prefers_knowing" }, // differ 2
      { questionKey: "music_ambiance", answer: "mellow_nostalgic" }, // organizer missing -> excluded from comparable
    ];

    const result = calculateBlendScore(organizerAnswers, friendAnswers, "Riya");

    // 4 comparable questions: 2 matches = 50%
    expect(result.comparableCount).toBe(4);
    expect(result.matchCount).toBe(2);
    expect(result.score).toBe(50);
    expect(result.scorePercentage).toBe("50%");

    // Breakdown details
    expect(result.sharedAnswers.length).toBe(2);
    expect(result.differentAnswers.length).toBe(2);
    expect(result.missingQuestions.length).toBe(2); // music_ambiance and social_circle
  });

  it("handles zero comparable answers safely without division by zero, showing no percentage", () => {
    // Case A: Organizer answered 2 questions, friend answered none
    const orgOnly: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" },
      { questionKey: "focus_type", answer: "shared_experience" },
    ];
    const friendEmpty: AnswerEntry[] = [];

    const resA = calculateBlendScore(orgOnly, friendEmpty, "Vikram");

    expect(resA.comparableCount).toBe(0);
    expect(resA.matchCount).toBe(0);
    expect(resA.score).toBeNull();
    expect(resA.scorePercentage).toBeNull(); // NO percentage shown!
    expect(resA.meaningExplanation).toContain("No comparable answers yet");

    // Case B: Completely disjoint question sets
    const orgDisjoint: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" },
    ];
    const friendDisjoint: AnswerEntry[] = [
      { questionKey: "music_ambiance", answer: "upbeat_celebratory" },
    ];

    const resB = calculateBlendScore(orgDisjoint, friendDisjoint, "Vikram");
    expect(resB.comparableCount).toBe(0);
    expect(resB.score).toBeNull();
    expect(resB.scorePercentage).toBeNull();
  });

  it("normalizes case and whitespace cleanly so formatting does not alter comparison", () => {
    expect(normalizeAnswer("  INTIMATE_COZY \n")).toBe("intimate_cozy");
    expect(normalizeAnswer("Shared_Experience  ")).toBe("shared_experience");

    const org: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "  INTIMATE_COZY  " },
      { questionKey: "focus_type", answer: "Shared_Experience\n" },
    ];
    const friend: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" },
      { questionKey: "focus_type", answer: "shared_experience" },
    ];

    const result = calculateBlendScore(org, friend, "Priya");

    expect(result.comparableCount).toBe(2);
    expect(result.matchCount).toBe(2);
    expect(result.score).toBe(100);
    expect(result.scorePercentage).toBe("100%");
  });

  it("enforces honest labeling: labels agreement between collaborators, never 'her preference' or 'love/happiness'", () => {
    const org: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" },
      { questionKey: "culinary_style", answer: "curated_specialty" },
    ];
    const friend: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" },
      { questionKey: "culinary_style", answer: "comfort_home_style" },
    ];

    const result = calculateBlendScore(org, friend, "Ananya");

    // Label verification
    expect(result.agreementLabel).toBe("agreement between you and Ananya");
    expect(result.agreementLabel).not.toContain("her preference");
    expect(result.agreementLabel).not.toContain("their preference");
    expect(result.agreementLabel).not.toContain("love");
    expect(result.agreementLabel).not.toContain("happiness");

    // Limits explanation
    expect(result.limitsExplanation).toContain("NOT a measure of the recipient's verified preference");
    expect(result.limitsExplanation).toContain("love");
    expect(result.limitsExplanation).toContain("happiness");

    // Planning insight on differences
    expect(result.differentAnswers.length).toBe(1);
    expect(result.planningInsight).toContain("differed on 1 question(s)");
    expect(result.planningInsight).toContain("Dining Style");
  });

  it("identifies missing questions categorized by who is missing", () => {
    const org: AnswerEntry[] = [
      { questionKey: "celebration_scale", answer: "intimate_cozy" },
    ];
    const friend: AnswerEntry[] = [
      { questionKey: "focus_type", answer: "shared_experience" },
    ];

    const result = calculateBlendScore(org, friend, "Karan");

    const scaleMissing = result.missingQuestions.find((m) => m.questionKey === "celebration_scale");
    const focusMissing = result.missingQuestions.find((m) => m.questionKey === "focus_type");
    const musicMissing = result.missingQuestions.find((m) => m.questionKey === "music_ambiance");

    expect(scaleMissing?.missingFrom).toBe("friend");
    expect(focusMissing?.missingFrom).toBe("organizer");
    expect(musicMissing?.missingFrom).toBe("both");
  });
});

describe("db: RLS on blend_sessions and blend_answers", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    const supabaseStandIns = `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    `;
    await db.exec(supabaseStandIns);

    const schemaSql = fs
      .readFileSync(path.resolve(process.cwd(), "schema.sql"), "utf8")
      .replace(/create extension if not exists "pgcrypto";/i, "");
    await db.exec(schemaSql);
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it("enforces RLS: User B cannot read or insert blend sessions for User A's occasion", async () => {
    const userA = "11111111-1111-1111-1111-111111111111";
    const userB = "22222222-2222-2222-2222-222222222222";
    const occasionA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

    // Create occasion for User A with bypass RLS to seed
    await db.exec(`
      insert into auth.users (id, email) values ('${userA}', 'userA@test.com'), ('${userB}', 'userB@test.com') on conflict do nothing;
      insert into public.occasions (id, owner_id, title) values ('${occasionA}', '${userA}', 'User A Anniversary');
    `);

    // 1. As User A: can create blend session and answers
    await db.exec(`
      set role authenticated;
      set request.jwt.claim.sub = '${userA}';
      set "request.jwt.claims" = '{"sub": "${userA}"}';

      insert into public.blend_sessions (id, occasion_id, stage)
      values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${occasionA}', 'pre');

      insert into public.blend_answers (session_id, respondent_role, question_key, answer)
      values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'organizer', 'celebration_scale', 'intimate_cozy');
    `);

    // Verify User A can read their session and answer
    const readA = await db.query<{ count: string }>(
      `select count(*) from public.blend_sessions where occasion_id = '${occasionA}';`
    );
    expect(Number(readA.rows[0].count)).toBe(1);

    // 2. Switch to User B: RLS should block SELECT on User A's blend session
    await db.exec(`
      set role authenticated;
      set request.jwt.claim.sub = '${userB}';
      set "request.jwt.claims" = '{"sub": "${userB}"}';
    `);

    const readB = await db.query<{ count: string }>(
      `select count(*) from public.blend_sessions where occasion_id = '${occasionA}';`
    );
    expect(Number(readB.rows[0].count)).toBe(0);

    const readAnswersB = await db.query<{ count: string }>(
      `select count(*) from public.blend_answers where session_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';`
    );
    expect(Number(readAnswersB.rows[0].count)).toBe(0);

    // 3. User B cannot insert answers into User A's blend session
    await expect(
      db.exec(`
        insert into public.blend_answers (session_id, respondent_role, question_key, answer)
        values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'friend', 'celebration_scale', 'vibrant_gathering');
      `)
    ).rejects.toThrow();
  });
});

