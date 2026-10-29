/**
 * HTML and SVG Sanitizer (Rule 23 & Task 9).
 *
 * Rules:
 * - Strips `<script>`, `onerror=`, `onload=`, inline event handlers (`on\w+`).
 * - Strips `javascript:` pseudo-protocols.
 * - Strips external image URLs (`http://`, `https://`).
 * - Never executes model-generated scripts.
 * - Server-safe: functions in both browser (DOMPurify) and server/test environments.
 */

import DOMPurify from "dompurify";

/**
 * Regex-based server sanitizer that runs in headless environments (Node, SSR, Vitest)
 * where DOMPurify window is not initialized.
 */
export function sanitizeHtmlServer(dirtyHtml: string): string {
  if (!dirtyHtml) return "";

  let clean = dirtyHtml;

  // 1. Remove script tags and their contents
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // 2. Remove iframe, object, embed, frame tags
  clean = clean.replace(/<\/?(iframe|object|embed|applet|frame|frameset|base)\b[^>]*>/gi, "");

  // 3. Remove inline event handlers (onerror=, onclick=, onload=, on\w+=)
  clean = clean.replace(/\s+on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 4. Remove javascript: pseudo-protocols in href or src
  clean = clean.replace(/(?:href|src)\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, "");

  // 5. Remove external image URLs (http:// or https:// in img src)
  clean = clean.replace(/<img\b[^>]*src\s*=\s*["']?https?:\/\/[^"'>\s]*["']?[^>]*>/gi, "");

  // 6. Remove standalone external src attributes
  clean = clean.replace(/src\s*=\s*["']?https?:\/\/[^"'>\s]*["']?/gi, "");

  return clean;
}

/**
 * Main sanitization function for HTML and SVG snippets.
 */
export function sanitizeHtml(dirtyHtml: string): string {
  if (!dirtyHtml) return "";

  // If running in browser environment with window available
  if (
    typeof window !== "undefined" &&
    typeof (DOMPurify as unknown as { sanitize?: unknown }).sanitize === "function"
  ) {
    const purified = DOMPurify.sanitize(dirtyHtml, {
      ALLOWED_TAGS: [
        "div",
        "span",
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "br",
        "hr",
        "strong",
        "em",
        "b",
        "i",
        "u",
        "svg",
        "path",
        "circle",
        "rect",
        "g",
        "line",
        "polyline",
        "polygon",
        "text",
      ],
      ALLOWED_ATTR: [
        "class",
        "style",
        "viewBox",
        "xmlns",
        "d",
        "fill",
        "stroke",
        "stroke-width",
        "cx",
        "cy",
        "r",
        "x",
        "y",
        "width",
        "height",
        "opacity",
        "stroke-linecap",
        "stroke-linejoin",
      ],
      FORBID_TAGS: ["script", "iframe", "object", "embed", "img", "link", "style"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "src", "href"],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    // Run secondary server pass to guarantee external URLs and remnants are strictly stripped
    return sanitizeHtmlServer(purified);
  }

  // Fallback for SSR / Node / Tests
  return sanitizeHtmlServer(dirtyHtml);
}
