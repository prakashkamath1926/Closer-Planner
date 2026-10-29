"use client";

import { MotionConfig, motion } from "framer-motion";

/** Gentle fade and 8px slide-in (design.md). Respects prefers-reduced-motion. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className={className}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
