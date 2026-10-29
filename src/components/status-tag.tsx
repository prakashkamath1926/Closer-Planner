import { Check, CircleHelp, Sparkles, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Fact status tags (design.md). Status is never shown by colour alone:
 * every tag carries a text label and an icon.
 */
export type FactStatus = "known" | "possible" | "needs_confirmation";

const config: Record<
  FactStatus,
  { label: string; Icon: LucideIcon; className: string }
> = {
  known: {
    label: "Known",
    Icon: Check,
    className: "bg-sage/40 text-sage-deep",
  },
  possible: {
    label: "Possible",
    Icon: Sparkles,
    className: "bg-butter text-plum",
  },
  needs_confirmation: {
    label: "Needs confirmation",
    Icon: CircleHelp,
    className: "bg-lavender text-plum",
  },
};

export function StatusTag({
  status,
  className,
}: {
  status: FactStatus;
  className?: string;
}) {
  const { label, Icon, className: tone } = config[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </span>
  );
}
