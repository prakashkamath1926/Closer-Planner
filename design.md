# Design System: Blush & Botanical (LOCKED)

Feeling: opening a handwritten letter, not a corporate dashboard. Mostly cream; pink is the accent. Romance comes from details (botanical SVGs, paper texture, handwritten notes), not from painting every component pink.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FDFBF7` | Page background |
| `card` | `#FFFFFF` | Cards and panels |
| `blush` | `#FFF0F1` | Secondary panels, selected states, empty states |
| `rose` | `#C2476B` | Primary buttons and links (white text) |
| `rose-deep` | `#A63A5C` | Hover/pressed; rose-colored text on tinted backgrounds |
| `plum` | `#3B2430` | Body text, headings |
| `mauve` | `#7A5C6B` | Secondary text |
| `lavender` | `#D9CCF0` | Our Blend, collaborator side, "Needs confirmation" tint |
| `peach` | `#FFC9B0` | Botanical illustrations, warm highlights |
| `butter` | `#FBE7A1` | "Why this suits them" notes, "Possible" tint |
| `sage` | `#A8C3A0` | Leaves, decoration, "Known" tint (never text) |
| `sage-deep` | `#4F5E47` | Success text, "Known" label |
| `shield` | `#2E1A2B` | Surprise Shield background |
| `gold` | `#E8C27A` | Shield lock, sparkles, countdown glow (decoration only) |

## Contrast rules (verify with axe/Lighthouse on real screens)
- White text only on `rose` or `rose-deep` or `shield`.
- Rose-colored text on blush or any tint must use `rose-deep`.
- Never use `peach`, `lavender`, `sage`, or `gold` as text color.
- Text on any tinted surface is `plum`; secondary text is `mauve` on `paper` or `card` only.
- Never rely on color alone: every status has a text label and icon.

## Status tags
| Status | Style |
|---|---|
| Known | `sage` tint + `sage-deep` text + check icon |
| Possible | `butter` tint + `plum` text + sparkle icon |
| Needs confirmation | `lavender` tint + `plum` text + question icon |
| Estimate / Quoted / Confirmed | butter / peach / sage tint, each with its label |
| Vendor: Suggested, Verified, Contacted, Confirmed | one rose-tint scale, label always shown |

## Typography
- Headings: **Fraunces** (500/600).
- Body and UI: **DM Sans**.
- Handwritten accent: **Caveat**, short decorative notes only, never form labels or critical info.
- Load with `next/font/google` (self-hosted, `display: swap`).
- Scale: 14 / 16 (body) / 18 / 24 / 32 / 44. Body line-height 1.6.

## Shape and motion
- Radius: 16px (inputs, small cards), 24px (hero cards, modals).
- Shadow: `0 4px 20px rgba(59,36,48,0.06)`.
- Scrapbook details (slight card rotation of 1 to 2 degrees, polaroid frames, washi-tape corners) on decorative cards only. Forms, plan tables, and budgets stay straight and clean.
- Framer Motion: gentle fades and 8px slides, 200 to 300ms. Respect `prefers-reduced-motion`.
- Visible focus ring: 2px `rose-deep` with 2px offset on every interactive element.

## Three experiences must look different
- **Organizer:** paper background, full navigation, lock badge on private items.
- **Collaborator:** lavender header strip with "You're helping with a surprise"; sees only shared items.
- **Recipient:** blush background, botanical frame, countdown with gold sparkle, no navigation, no planner chrome.
- **Surprise Shield cover:** `shield` background, gold heart-padlock, neutral text "Something special is being prepared". It must look nothing like the planner.

## `src/app/globals.css`

```css
@import "tailwindcss";

:root {
  --paper: #FDFBF7;
  --card: #FFFFFF;
  --blush: #FFF0F1;
  --rose: #C2476B;
  --rose-deep: #A63A5C;
  --plum: #3B2430;
  --mauve: #7A5C6B;
  --lavender: #D9CCF0;
  --peach: #FFC9B0;
  --butter: #FBE7A1;
  --sage: #A8C3A0;
  --sage-deep: #4F5E47;
  --shield: #2E1A2B;
  --gold: #E8C27A;

  /* shadcn/ui semantic tokens */
  --background: var(--paper);
  --foreground: var(--plum);
  --card-foreground: var(--plum);
  --popover: var(--card);
  --popover-foreground: var(--plum);
  --primary: var(--rose);
  --primary-foreground: #FFFFFF;
  --secondary: var(--blush);
  --secondary-foreground: var(--plum);
  --muted: var(--blush);
  --muted-foreground: var(--mauve);
  --accent: var(--lavender);
  --accent-foreground: var(--plum);
  --destructive: #B3261E;
  --destructive-foreground: #FFFFFF;
  --border: #EBDDE0;
  --input: #EBDDE0;
  --ring: var(--rose-deep);
  --radius: 1rem;
}

@theme inline {
  --color-paper: var(--paper);
  --color-blush: var(--blush);
  --color-rose: var(--rose);
  --color-rose-deep: var(--rose-deep);
  --color-plum: var(--plum);
  --color-mauve: var(--mauve);
  --color-lavender: var(--lavender);
  --color-peach: var(--peach);
  --color-butter: var(--butter);
  --color-sage: var(--sage);
  --color-sage-deep: var(--sage-deep);
  --color-shield: var(--shield);
  --color-gold: var(--gold);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --font-heading: var(--font-fraunces), serif;
  --font-sans: var(--font-dm-sans), system-ui, sans-serif;
  --font-hand: var(--font-caveat), cursive;
  --shadow-paper: 0 4px 20px rgba(59, 36, 48, 0.06);
}

body { background: var(--background); color: var(--foreground); font-family: var(--font-sans); line-height: 1.6; }
h1, h2, h3 { font-family: var(--font-heading); }
:focus-visible { outline: 2px solid var(--rose-deep); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

If the project uses Tailwind v3, put the same hex values under `theme.extend.colors` with these names.

## `src/lib/theme.ts`

```ts
export const colors = {
  paper: "#FDFBF7", card: "#FFFFFF", blush: "#FFF0F1",
  rose: "#C2476B", roseDeep: "#A63A5C", plum: "#3B2430", mauve: "#7A5C6B",
  lavender: "#D9CCF0", peach: "#FFC9B0", butter: "#FBE7A1",
  sage: "#A8C3A0", sageDeep: "#4F5E47", shield: "#2E1A2B", gold: "#E8C27A",
} as const;
```

## Change policy
No palette changes unless axe or Lighthouse finds a real contrast or usability failure on a finished screen.
