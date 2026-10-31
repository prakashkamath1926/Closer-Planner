"use client";

/**
 * BYOK (Bring Your Own Key) Client Management.
 *
 * Rules:
 * - Session-only: stored strictly in sessionStorage or memory.
 * - NEVER written to localStorage, cookies, URL parameters, or any server database.
 * - Disappears completely when the browser tab is closed.
 * - Providers restricted strictly to "groq" and "google".
 */

export type ByokProvider = "groq" | "google";

export interface StoredByokConfig {
  provider: ByokProvider;
  apiKey: string;
  model: string;
}

const BYOK_SESSION_KEY = "closer_byok_session_v1";

export function getStoredByok(): StoredByokConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BYOK_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      (parsed?.provider === "groq" || parsed?.provider === "google") &&
      typeof parsed?.apiKey === "string" &&
      parsed.apiKey.trim().length > 0
    ) {
      return {
        provider: parsed.provider,
        apiKey: parsed.apiKey.trim(),
        model: parsed.model || (parsed.provider === "groq" ? "openai/gpt-oss-20b" : "gemini-3.1-flash-lite"),
      };
    }
  } catch {
    // Ignore JSON parse errors
  }
  return null;
}

export function saveStoredByok(config: StoredByokConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BYOK_SESSION_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("closer:byok-change"));
  } catch {
    // SessionStorage may fail in restricted iframes
  }
}

export function clearStoredByok(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(BYOK_SESSION_KEY);
    window.dispatchEvent(new CustomEvent("closer:byok-change"));
  } catch {
    // Ignore
  }
}

/**
 * Returns custom headers to include with API calls when BYOK is active.
 */
export function getByokHeaders(): Record<string, string> {
  const byok = getStoredByok();
  if (!byok) return {};
  return {
    "x-byok-provider": byok.provider,
    "x-byok-key": byok.apiKey,
    "x-byok-model": byok.model,
  };
}

export function openAiSettingsDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("closer:open-ai-settings"));
}
