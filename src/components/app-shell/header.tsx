import Link from "next/link";
import { Suspense } from "react";
import { Heart } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

import { MobileNav } from "./mobile-nav";
import { navLinks, navLinkClasses } from "./nav-links";
import { AuthStatus } from "./auth-status";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-paper/95 backdrop-blur">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-2xl font-heading text-xl font-semibold text-plum focus-visible:outline-2 focus-visible:outline-rose-deep"
        >
          <span className="grid size-9 place-items-center rounded-full bg-blush text-rose-deep">
            <Heart aria-hidden="true" className="size-5" fill="currentColor" />
          </span>
          {APP_NAME}
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={navLinkClasses}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <div className="h-5 w-px bg-border shrink-0" aria-hidden="true" />
          <Suspense fallback={null}>
            <AuthStatus />
          </Suspense>
        </div>

        <MobileNav links={navLinks} />
      </div>
    </header>
  );
}
