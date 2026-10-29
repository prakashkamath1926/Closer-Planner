/**
 * Versioned Prompt: Per-Category Vendor Questions to Ask.
 */

export const VENDOR_QUESTIONS_PROMPT_VERSION = "2026-10-29.v1";

export interface VendorQuestionsPromptInput {
  category: string;
  occasionType: string;
}

export function buildVendorQuestionsPrompt(input: VendorQuestionsPromptInput): string {
  return `You are an expert event planner helping an organizer vet potential vendors.
Generate 3 to 5 vital, high-leverage questions to ask a vendor in the "${input.category}" category for a "${input.occasionType}".

Focus on:
1. Operational reliability and backup plans (what happens if equipment fails or primary vendor gets sick).
2. Hidden fees (setup/cleanup fees, travel charges, overtime rates, taxes).
3. Timelines, setup buffer, and teardown constraints.
4. Cancellation policy, advance deposit, and refund schedule.

Return sharp, concise, actionable questions.
`;
}

