/**
 * Blush & Botanical design tokens (LOCKED, see design.md).
 * Keep in sync with the CSS variables in src/app/globals.css.
 * UI components must use the Tailwind token utilities, not these raw values.
 * This object exists for non-CSS consumers (tests, generated SVG/PNG outputs).
 */
export const colors = {
  paper: "#FDFBF7",
  card: "#FFFFFF",
  blush: "#FFF0F1",
  rose: "#C2476B",
  roseDeep: "#A63A5C",
  plum: "#3B2430",
  mauve: "#7A5C6B",
  lavender: "#D9CCF0",
  peach: "#FFC9B0",
  butter: "#FBE7A1",
  sage: "#A8C3A0",
  sageDeep: "#4F5E47",
  shield: "#2E1A2B",
  gold: "#E8C27A",
} as const;

export type ColorToken = keyof typeof colors;
