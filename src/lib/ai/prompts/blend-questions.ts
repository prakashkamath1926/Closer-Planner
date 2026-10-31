/**
 * Dynamic AI Blend Questions Prompt
 * Generates 4 to 5 celebration-specific binary vibe check questions
 * tailored directly to the organizer's celebration prompt, recipient, and intent.
 */

export const BLEND_QUESTIONS_PROMPT_VERSION = "2026-10-31.v1";

export interface BlendQuestionsPromptInput {
  occasionType: string;
  recipientName?: string;
  relationship?: string;
  intentSummary?: string;
  concept?: string;
  knownInterests?: string[];
  guestCount?: number;
}

export function buildBlendQuestionsPrompt(input: BlendQuestionsPromptInput): string {
  const name = input.recipientName || "the celebrated guest";
  const occasion = input.occasionType || "Celebration";
  const intent = input.intentSummary || "A warm, thoughtful, and personal experience";
  const concept = input.concept || (input.knownInterests && input.knownInterests.length > 0 ? input.knownInterests.join(", ") : "a meaningful celebration");

  return `You are an empathetic celebration planner and relationship designer.
We are creating "Our Blend" (a pre-event vibe match tool) for a celebration.
The organizer and a trusted friend who knows ${name} well will each answer these questions to compare their perspectives and uncover shared intuitions or differing views before finalizing details.

CELEBRATION CONTEXT (FROM USER PROMPT):
- Occasion: ${occasion}
- Guest of Honor: ${name}${input.relationship ? ` (${input.relationship})` : ""}
- Core Concept / Vision: ${concept}
- Desired Emotional Feeling: ${intent}
${input.knownInterests && input.knownInterests.length > 0 ? `- Interests & Loves: ${input.knownInterests.join(", ")}` : ""}
${input.guestCount ? `- Expected Guest Count: ~${input.guestCount}` : ""}

YOUR TASK:
Generate exactly 4 or 5 binary vibe-check questions tailored specifically to ${name}'s ${occasion} and this prompt.

STRICT REQUIREMENTS:
1. Every question MUST explicitly relate to ${name}, their personality, and the specific vibe/activity planned (e.g. food choices, atmosphere, surprise level, flow of time, memorabilia).
2. DO NOT output generic, disconnected party questions.
3. Each question must provide exactly 2 distinct, thoughtful, non-judgmental options (A vs B).
4. Each option must have:
   - "value": a snake_case identifier (e.g., "intimate_rooftop_acoustic")
   - "label": a concise, attractive title (e.g., "Intimate Acoustic Lounge")
   - "description": a vivid 1-sentence explanation of what that choice feels like
5. Return clean structured JSON matching the requested schema.
`;
}

