"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NavLink } from "./nav-links";
import { navLinkClasses } from "./nav-links";
import { AuthStatus } from "./auth-status";

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="md:hidden">
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          Menu
        </Button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.nav
              id={panelId}
              aria-label="Mobile Navigation"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-x-0 top-full border-b border-border bg-paper px-4 py-4 shadow-paper"
            >
              <ul className="flex flex-col gap-1">
                {links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`${navLinkClasses} w-full min-h-11 justify-start px-4`}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t border-border pt-3 px-2">
                <AuthStatus />
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
