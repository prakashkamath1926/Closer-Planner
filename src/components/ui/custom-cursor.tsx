"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Custom Cursor Component (Dot + Lagging Ring)
 *
 * Rules:
 * - Mounted once in root layout.
 * - Renders nothing until: pointer: fine, prefers-reduced-motion: no-preference, and real mousemove.
 * - Dot: 5px, rose-deep token, zero lag.
 * - Ring: 32px, 1.5px rose border, lerp factor ~0.18 in one rAF loop.
 * - Transform only, passive listeners.
 * - Hover states: links/buttons -> ~48px with soft rose tint; [data-cursor="open"] -> "Open"; pressed -> scales down.
 * - Switches to gold token over dark backgrounds (Shield / plum).
 * - Native cursor never hidden over inputs/textareas/selects/contenteditable/[data-cursor="native"].
 * - aria-hidden="true", pointer-events: none, z-index above modals.
 */
export function CustomCursor() {
  const [isActive, setIsActive] = useState(false);
  const cursorRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const finePointerQuery = window.matchMedia("(pointer: fine)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    let hasMoved = false;
    let isTornDown = false;
    let rafId: number | null = null;

    let targetX = -100;
    let targetY = -100;
    let ringX = -100;
    let ringY = -100;

    let isHovered = false;
    let isOpenTarget = false;
    let isOverNative = false;
    let isMouseDown = false;
    let isOverDark = false;
    let isInsideWindow = false;

    const teardown = () => {
      isTornDown = true;
      setIsActive(false);
      document.documentElement.classList.remove("custom-cursor-active");
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const handleMediaChange = () => {
      if (!finePointerQuery.matches || reducedMotionQuery.matches) {
        teardown();
      }
    };

    finePointerQuery.addEventListener("change", handleMediaChange);
    reducedMotionQuery.addEventListener("change", handleMediaChange);

    // Initial check
    if (!finePointerQuery.matches || reducedMotionQuery.matches) {
      return () => {
        finePointerQuery.removeEventListener("change", handleMediaChange);
        reducedMotionQuery.removeEventListener("change", handleMediaChange);
      };
    }

    const updateLoop = () => {
      if (isTornDown) return;

      if (isInsideWindow && !isOverNative) {
        // Lerp ring
        ringX += (targetX - ringX) * 0.18;
        ringY += (targetY - ringY) * 0.18;

        // Determine ring scale
        let scale = 1;
        if (isHovered) scale = 1.5; // 32px * 1.5 = 48px
        if (isOpenTarget) scale = 1.8;
        if (isMouseDown) scale *= 0.85;

        if (dotRef.current) {
          dotRef.current.style.transform = `translate3d(${targetX - 2.5}px, ${targetY - 2.5}px, 0)`;
        }

        if (ringRef.current) {
          ringRef.current.style.transform = `translate3d(${ringX - 16}px, ${ringY - 16}px, 0) scale(${scale})`;
        }
      }

      rafId = requestAnimationFrame(updateLoop);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!hasMoved) {
        hasMoved = true;
        setIsActive(true);
        document.documentElement.classList.add("custom-cursor-active");
        rafId = requestAnimationFrame(updateLoop);
      }

      isInsideWindow = true;
      targetX = e.clientX;
      targetY = e.clientY;

      // Element detection
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!target) return;

      // Check native input elements
      const nativeInput = target.closest(
        'input, textarea, select, [contenteditable="true"], [data-cursor="native"]'
      );
      isOverNative = Boolean(nativeInput);

      // Check clickable / hoverable targets
      const clickable = target.closest(
        'a, button, [role="button"], [role="tab"], summary, label, [data-cursor="link"]'
      );
      isHovered = Boolean(clickable);

      const openTarget = target.closest('[data-cursor="open"]');
      isOpenTarget = Boolean(openTarget);

      // Check dark background (Shield or plum containers)
      const darkContainer = target.closest(
        '.bg-plum, [class*="bg-plum"], [data-theme="dark"], .bg-black'
      );
      isOverDark = Boolean(darkContainer);

      // Apply visibility and colors to DOM directly for 60fps performance
      if (cursorRef.current) {
        cursorRef.current.style.opacity = isOverNative || !isInsideWindow ? "0" : "1";
      }

      if (dotRef.current) {
        dotRef.current.style.backgroundColor = isOverDark ? "var(--gold)" : "var(--rose-deep)";
      }

      if (ringRef.current) {
        ringRef.current.style.borderColor = isOverDark ? "var(--gold)" : "var(--rose)";
        ringRef.current.style.backgroundColor = isHovered
          ? isOverDark
            ? "rgba(232, 194, 122, 0.15)"
            : "rgba(194, 71, 107, 0.12)"
          : "transparent";
      }

      if (labelRef.current) {
        labelRef.current.style.display = isOpenTarget ? "block" : "none";
        labelRef.current.style.color = isOverDark ? "var(--gold)" : "var(--rose-deep)";
      }
    };

    const handleMouseDown = () => {
      isMouseDown = true;
    };

    const handleMouseUp = () => {
      isMouseDown = false;
    };

    const handleMouseLeave = () => {
      isInsideWindow = false;
      if (cursorRef.current) {
        cursorRef.current.style.opacity = "0";
      }
    };

    const handleMouseEnter = () => {
      isInsideWindow = true;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isInsideWindow = false;
        if (cursorRef.current) {
          cursorRef.current.style.opacity = "0";
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown, { passive: true });
    window.addEventListener("mouseup", handleMouseUp, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave, { passive: true });
    document.addEventListener("mouseenter", handleMouseEnter, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      teardown();
      finePointerQuery.removeEventListener("change", handleMediaChange);
      reducedMotionQuery.removeEventListener("change", handleMediaChange);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (!isActive) return null;

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] transition-opacity duration-150"
      style={{ opacity: 0 }}
    >
      {/* 5px direct dot */}
      <div
        ref={dotRef}
        className="pointer-events-none fixed top-0 left-0 size-[5px] rounded-full will-change-transform"
        style={{
          backgroundColor: "var(--rose-deep)",
        }}
      />

      {/* 32px lagging ring */}
      <div
        ref={ringRef}
        className="pointer-events-none fixed top-0 left-0 flex size-8 items-center justify-center rounded-full border-[1.5px] will-change-transform transition-[border-color,background-color] duration-150"
        style={{
          borderColor: "var(--rose)",
        }}
      >
        <span
          ref={labelRef}
          className="hidden text-[8px] font-bold uppercase tracking-wider"
          style={{ color: "var(--rose-deep)" }}
        >
          Open
        </span>
      </div>
    </div>
  );
}
