export type NavLink = { href: string; label: string };

/** Shared link styling across desktop nav, mobile nav, and header actions */
export const navLinkClasses =
  "inline-flex items-center rounded-2xl px-3.5 py-1.5 text-sm font-medium text-plum hover:bg-blush hover:text-plum focus-visible:outline-2 focus-visible:outline-rose-deep transition-colors";

export const signOutLinkClasses =
  "inline-flex items-center rounded-2xl px-3 py-1.5 text-sm font-medium text-mauve hover:text-plum hover:bg-blush focus-visible:outline-2 focus-visible:outline-rose-deep transition-colors";

export const compactPrimaryButtonClasses =
  "inline-flex items-center justify-center rounded-2xl bg-rose px-3.5 py-1.5 text-sm font-medium text-white shadow-2xs hover:bg-rose-deep focus-visible:outline-2 focus-visible:outline-rose-deep transition-colors";

/** Anchors that exist on the home page today. Real routes arrive with later tasks. */
export const navLinks: NavLink[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#honest-by-design", label: "Honest by design" },
];
