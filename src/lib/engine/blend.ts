/**
 * Our Blend: Pre-event Vibe Match Engine (prd.md 6.12 & Task 10).
 *
 * Rules:
 * - Deterministic scoring computed in pure code (no AI).
 * - Fixed set of 6 questions with typed keys and options.
 * - Score = (matching comparable answers / comparable answers) * 100.
 * - Unanswered or incomparable questions are excluded.
 * - ZERO comparable answers: no divide by zero; score is null, no percentage shown.
 * - Normalizes case and whitespace.
 * - Honest labeling: "agreement between you and <name>", NEVER "her preference",
 *   and NEVER a measure of love, relationship quality, or happiness.
 * - Explains what the score means and does not mean.
 */

export interface BlendQuestion {
  key: string;
  category: string;
  title: string;
  subtitle: string;
  options: Array<{
    value: string;
    label: string;
    description: string;
  }>;
}

export const BLEND_QUESTIONS: BlendQuestion[] = [
  {
    key: "celebration_scale",
    category: "Vibe & Energy",
    title: "Celebration Scale & Setting",
    subtitle: "What kind of atmosphere would feel most comfortable?",
    options: [
      {
        value: "intimate_cozy",
        label: "Quiet, Intimate & Cozy",
        description: "Small circle, low sensory stimulation, deep conversations",
      },
      {
        value: "vibrant_gathering",
        label: "Lively, Vibrant Gathering",
        description: "Bustling social atmosphere, energetic music, joyful mingling",
      },
    ],
  },
  {
    key: "focus_type",
    category: "Experience vs Gifts",
    title: "Core Celebration Focus",
    subtitle: "What leaves the most lasting emotional impact?",
    options: [
      {
        value: "shared_experience",
        label: "Shared Activity or Experience",
        description: "Doing something together (cooking, tasting, adventure, workshop)",
      },
      {
        value: "thoughtful_keepsake",
        label: "Thoughtful Keepsake or Handmade Gift",
        description: "A lasting tangible reminder (letters, photo album, custom art)",
      },
    ],
  },
  {
    key: "culinary_style",
    category: "Food & Dining",
    title: "Dining Style",
    subtitle: "How should food and drinks be served?",
    options: [
      {
        value: "comfort_home_style",
        label: "Comfort Favorites & Informal Sharing",
        description: "Favorite nostalgic dishes, grazing platters, relaxed dining",
      },
      {
        value: "curated_specialty",
        label: "Curated Tasting or Special Restaurant",
        description: "A memorable reservation, specialty menu, or private chef",
      },
    ],
  },
  {
    key: "surprise_comfort",
    category: "Surprises & Reveals",
    title: "Comfort with Reveals",
    subtitle: "How do they react to unexpected surprises?",
    options: [
      {
        value: "loves_surprises",
        label: "Loves Surprises & Dramatic Reveals",
        description: "Enjoys anticipation, clue trails, and hidden elements",
      },
      {
        value: "prefers_knowing",
        label: "Prefers Knowing the Schedule Ahead",
        description: "Values predictability, knowing dress code, avoiding sudden shock",
      },
    ],
  },
  {
    key: "music_ambiance",
    category: "Sound & Atmosphere",
    title: "Acoustic Ambiance",
    subtitle: "What kind of soundtrack fits best?",
    options: [
      {
        value: "mellow_nostalgic",
        label: "Mellow, Acoustic & Nostalgic",
        description: "Warm background sound allowing effortless conversation",
      },
      {
        value: "upbeat_celebratory",
        label: "Upbeat, Dancing & Energetic",
        description: "Rhythm-driven party anthems and dance floor energy",
      },
    ],
  },
  {
    key: "social_circle",
    category: "Guest Dynamics",
    title: "Guest Circle",
    subtitle: "Who should be invited to the core moment?",
    options: [
      {
        value: "closest_inner_circle",
        label: "Closest Inner Circle Only (2-5 people)",
        description: "Only the few people they share everything with",
      },
      {
        value: "broader_community",
        label: "Wider Circle of Friends & Family",
        description: "A broader group of acquaintances, peers, and extended circle",
      },
    ],
  },
];

export interface AnswerEntry {
  questionKey: string;
  answer: string;
}

export interface SharedAnswerDetail {
  questionKey: string;
  questionTitle: string;
  matchedValue: string;
  matchedDisplay: string;
}

export interface DifferentAnswerDetail {
  questionKey: string;
  questionTitle: string;
  organizerValue: string;
  organizerDisplay: string;
  friendValue: string;
  friendDisplay: string;
}

export interface MissingAnswerDetail {
  questionKey: string;
  questionTitle: string;
  missingFrom: "organizer" | "friend" | "both";
}

export interface BlendScoreResult {
  friendName: string;
  score: number | null;
  scorePercentage: string | null;
  comparableCount: number;
  totalQuestionsCount: number;
  matchCount: number;
  agreementLabel: string;
  meaningExplanation: string;
  limitsExplanation: string;
  sharedAnswers: SharedAnswerDetail[];
  differentAnswers: DifferentAnswerDetail[];
  missingQuestions: MissingAnswerDetail[];
  planningInsight: string;
}

/**
 * Normalizes an answer string: lowercase, trimmed.
 */
export function normalizeAnswer(ans?: string | null): string {
  if (!ans) return "";
  return ans.trim().toLowerCase();
}

/**
 * Finds the human-readable display label for a question key and value.
 */
export function getOptionDisplay(
  questionKey: string,
  value: string,
  questions: BlendQuestion[] = BLEND_QUESTIONS,
): string {
  const q = questions.find((item) => item.key === questionKey);
  if (!q) return value;
  const opt = q.options.find((o) => normalizeAnswer(o.value) === normalizeAnswer(value));
  return opt ? opt.label : value;
}

/**
 * Calculates the Our Blend score and answer breakdowns between organizer and friend.
 */
export function calculateBlendScore(
  organizerAnswers: AnswerEntry[],
  friendAnswers: AnswerEntry[],
  friendLabel: string = "trusted friend",
  questions: BlendQuestion[] = BLEND_QUESTIONS,
): BlendScoreResult {
  const friendName = friendLabel.trim() || "trusted friend";
  const orgMap = new Map<string, string>();
  const friendMap = new Map<string, string>();

  for (const a of organizerAnswers) {
    if (a.answer && a.answer.trim().length > 0) {
      orgMap.set(a.questionKey, normalizeAnswer(a.answer));
    }
  }

  for (const a of friendAnswers) {
    if (a.answer && a.answer.trim().length > 0) {
      friendMap.set(a.questionKey, normalizeAnswer(a.answer));
    }
  }

  const sharedAnswers: SharedAnswerDetail[] = [];
  const differentAnswers: DifferentAnswerDetail[] = [];
  const missingQuestions: MissingAnswerDetail[] = [];

  let comparableCount = 0;
  let matchCount = 0;

  for (const q of questions) {
    const orgAns = orgMap.get(q.key);
    const friendAns = friendMap.get(q.key);

    const hasOrg = Boolean(orgAns);
    const hasFriend = Boolean(friendAns);

    if (hasOrg && hasFriend) {
      comparableCount++;
      if (orgAns === friendAns) {
        matchCount++;
        sharedAnswers.push({
          questionKey: q.key,
          questionTitle: q.title,
          matchedValue: orgAns!,
          matchedDisplay: getOptionDisplay(q.key, orgAns!, questions),
        });
      } else {
        differentAnswers.push({
          questionKey: q.key,
          questionTitle: q.title,
          organizerValue: orgAns!,
          organizerDisplay: getOptionDisplay(q.key, orgAns!, questions),
          friendValue: friendAns!,
          friendDisplay: getOptionDisplay(q.key, friendAns!, questions),
        });
      }
    } else if (!hasOrg && !hasFriend) {
      missingQuestions.push({
        questionKey: q.key,
        questionTitle: q.title,
        missingFrom: "both",
      });
    } else if (!hasOrg) {
      missingQuestions.push({
        questionKey: q.key,
        questionTitle: q.title,
        missingFrom: "organizer",
      });
    } else {
      missingQuestions.push({
        questionKey: q.key,
        questionTitle: q.title,
        missingFrom: "friend",
      });
    }
  }

  // Safe score calculation (No divide by zero when comparableCount === 0)
  const score = comparableCount > 0 ? Math.round((matchCount / comparableCount) * 100) : null;
  const scorePercentage = score !== null ? `${score}%` : null;

  const agreementLabel = `agreement between you and ${friendName}`;

  const meaningExplanation =
    score !== null
      ? `This score reflects ${matchCount} matching perspective${matchCount === 1 ? "" : "s"} out of ${comparableCount} comparable question${comparableCount === 1 ? "" : "s"} between you and ${friendName}.`
      : `No comparable answers yet. Once both you and ${friendName} answer at least one shared question, your agreement score will appear.`;

  const limitsExplanation =
    "This is strictly a comparison of impressions between collaborators. It is NOT a measure of the recipient's verified preference, relationship closeness, love, or predicted event happiness.";

  // Planning insight based on differences
  let planningInsight = "Your perspectives are fully aligned on all compared points!";
  if (differentAnswers.length > 0) {
    planningInsight = `You and ${friendName} differed on ${differentAnswers.length} question(s) (including ${differentAnswers.map((d) => d.questionTitle).join(", ")}). Consider casually verifying these points with the recipient or preparing a versatile option in your plan.`;
  }

  return {
    friendName,
    score,
    scorePercentage,
    comparableCount,
    totalQuestionsCount: questions.length,
    matchCount,
    agreementLabel,
    meaningExplanation,
    limitsExplanation,
    sharedAnswers,
    differentAnswers,
    missingQuestions,
    planningInsight,
  };
}

