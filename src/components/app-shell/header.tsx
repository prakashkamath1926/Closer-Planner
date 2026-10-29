import Link from "next/link";
import { Heart } from "lucide-react";

import { MobileNav } from "./mobile-nav";
import { navLinks } from "./nav-links";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-paper/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-2xl font-heading text-xl font-semibold text-plum"
        >
          <span className="grid size-9 place-items-center rounded-full bg-blush text-rose-deep">
            <Heart aria-hidden="true" className="size-5" fill="currentColor" />
          </span>
          Celebration Companion
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-2xl px-4 text-base font-medium text-plum hover:bg-blush"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <MobileNav links={navLinks} />
      </div>
    </header>
  );
}
