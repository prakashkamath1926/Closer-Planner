import { describe, it, expect, beforeEach, vi } from "vitest";
import { getStoredByok, getByokHeaders, saveStoredByok, clearStoredByok } from "@/lib/ai/byok-client";

describe("BYOK Client Session & Header Management", () => {
  beforeEach(() => {
    // Provide a mocked sessionStorage
    const store = new Map<string, string>();
    const mockSessionStorage = {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    };
    vi.stubGlobal("sessionStorage", mockSessionStorage);
    vi.stubGlobal("window", {
      sessionStorage: mockSessionStorage,
      dispatchEvent: vi.fn(),
    });
    clearStoredByok();
  });

  it("when user has not chosen BYOK, getByokHeaders returns empty object (NO headers sent)", () => {
    const headers = getByokHeaders();
    expect(headers).toEqual({});
    expect(Object.keys(headers).length).toBe(0);
  });

  it("when valid groq BYOK is saved, getByokHeaders returns valid x-byok-* headers", () => {
    saveStoredByok({
      provider: "groq",
      apiKey: "gsk_custom_session_key",
      model: "openai/gpt-oss-20b",
    });

    const headers = getByokHeaders();
    expect(headers).toEqual({
      "x-byok-provider": "groq",
      "x-byok-key": "gsk_custom_session_key",
      "x-byok-model": "openai/gpt-oss-20b",
    });
  });

  it("when invalid/unsupported provider is in sessionStorage, getStoredByok clears it cleanly without breaking default flow", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.sessionStorage.setItem(
      "closer_byok_session_v1",
      JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-test" })
    );

    const stored = getStoredByok();
    expect(stored).toBeNull();
    // Verify it was cleared
    expect(window.sessionStorage.getItem("closer_byok_session_v1")).toBeNull();
    // Verify getByokHeaders returns empty
    expect(getByokHeaders()).toEqual({});
    spy.mockRestore();
  });

  it("when empty or whitespace apiKey is in sessionStorage, getStoredByok clears it cleanly", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.sessionStorage.setItem(
      "closer_byok_session_v1",
      JSON.stringify({ provider: "groq", apiKey: "   " })
    );

    const stored = getStoredByok();
    expect(stored).toBeNull();
    expect(window.sessionStorage.getItem("closer_byok_session_v1")).toBeNull();
    expect(getByokHeaders()).toEqual({});
    spy.mockRestore();
  });

  it("when malformed JSON is in sessionStorage, getStoredByok clears it cleanly", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.sessionStorage.setItem("closer_byok_session_v1", "{corrupted_json");

    const stored = getStoredByok();
    expect(stored).toBeNull();
    expect(window.sessionStorage.getItem("closer_byok_session_v1")).toBeNull();
    expect(getByokHeaders()).toEqual({});
    spy.mockRestore();
  });
});
