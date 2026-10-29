import { cn } from "@/lib/utils";

/** Decorative botanical sprig. Purely ornamental, hidden from assistive technology. */
export function BotanicalSprig({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 260"
      className={cn("h-auto w-full", className)}
    >
      <path
        d="M100 255 C98 190 104 120 100 40"
        className="fill-none stroke-sage-deep"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M100 200 C60 190 40 160 36 130 C70 134 96 160 100 200Z"
        className="fill-sage"
      />
      <path
        d="M100 160 C140 150 164 122 168 92 C132 98 104 124 100 160Z"
        className="fill-sage"
      />
      <path
        d="M100 112 C70 104 56 84 54 62 C80 66 98 84 100 112Z"
        className="fill-sage"
      />
      <g transform="translate(100 38)">
        <circle r="10" className="fill-gold" />
        <circle cx="0" cy="-20" r="14" className="fill-peach" />
        <circle cx="19" cy="-6" r="14" className="fill-rose/50" />
        <circle cx="12" cy="16" r="14" className="fill-peach" />
        <circle cx="-12" cy="16" r="14" className="fill-rose/50" />
        <circle cx="-19" cy="-6" r="14" className="fill-peach" />
        <circle r="9" className="fill-gold" />
      </g>
    </svg>
  );
}
