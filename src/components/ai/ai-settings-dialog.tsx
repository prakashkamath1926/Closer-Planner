"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { KeyRound, X, CheckCircle2, AlertCircle, Eye, EyeOff, ShieldCheck, Sparkles, Loader2 } from "lucide-react";
import {
  getStoredByok,
  saveStoredByok,
  clearStoredByok,
  type ByokProvider,
} from "@/lib/ai/byok-client";

const emptySubscribe = () => () => {};

const PROVIDER_MODELS: Record<ByokProvider, Array<{ id: string; name: string }>> = {
  groq: [
    { id: "openai/gpt-oss-20b", name: "Groq: openai/gpt-oss-20b (Fast default)" },
    { id: "openai/gpt-oss-120b", name: "Groq: openai/gpt-oss-120b (High reasoning)" },
  ],
  google: [
    { id: "gemini-3.1-flash-lite", name: "Google: gemini-3.1-flash-lite (Recommended)" },
    { id: "gemini-3.5-flash-lite", name: "Google: gemini-3.5-flash-lite" },
  ],
};

export function AiSettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"default" | "byok">(() => (getStoredByok() ? "byok" : "default"));
  const [provider, setProvider] = useState<ByokProvider>(() => getStoredByok()?.provider || "groq");
  const [apiKey, setApiKey] = useState(() => getStoredByok()?.apiKey || "");
  const [model, setModel] = useState(() => getStoredByok()?.model || "openai/gpt-oss-20b");
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const isClient = useSyncExternalStore(emptySubscribe, () => true, () => false);

  // Listen to open events from footer link or fallback banner
  useEffect(() => {
    const handleOpen = () => {
      const stored = getStoredByok();
      if (stored) {
        setMode("byok");
        setProvider(stored.provider);
        setApiKey(stored.apiKey);
        setModel(stored.model);
      }
      setIsOpen(true);
    };
    window.addEventListener("closer:open-ai-settings", handleOpen);
    return () => window.removeEventListener("closer:open-ai-settings", handleOpen);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen || !isClient) return null;

  const handleProviderChange = (newProvider: ByokProvider) => {
    setProvider(newProvider);
    setModel(PROVIDER_MODELS[newProvider][0]?.id || "");
    setTestResult(null);
  };

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: "Please enter an API key to test." });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setSavedSuccess(false);

    try {
      const res = await fetch("/api/ai/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          model,
        }),
      });

      const data = await res.json();
      if (data.valid) {
        setTestResult({
          success: true,
          message: `Connected successfully to ${provider === "groq" ? "Groq" : "Google AI Studio"}!`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Verification failed. Please double-check your key.",
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: "Network error while connecting to verification endpoint.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (mode === "default") {
      clearStoredByok();
      setSavedSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        setSavedSuccess(false);
      }, 700);
      return;
    }

    if (!apiKey.trim()) {
      setTestResult({ success: false, message: "Please enter an API key before saving." });
      return;
    }

    saveStoredByok({
      provider,
      apiKey: apiKey.trim(),
      model,
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setIsOpen(false);
      setSavedSuccess(false);
    }, 700);
  };

  const handleClear = () => {
    clearStoredByok();
    setApiKey("");
    setMode("default");
    setTestResult(null);
    setSavedSuccess(false);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-plum/50 backdrop-blur-xs p-4 sm:p-6"
    >
      <div className="flex min-h-full items-start justify-center">
        <div className="relative my-auto w-full max-w-lg rounded-3xl border border-blush bg-white p-6 sm:p-8 text-left shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Close settings"
          className="absolute right-4 top-4 rounded-full p-2 text-mauve hover:bg-blush hover:text-plum focus-visible:outline-2 focus-visible:outline-rose-deep"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        {/* Dialog Header */}
        <div className="flex items-center gap-3 border-b border-blush pb-4">
          <div className="grid size-10 place-items-center rounded-full bg-blush text-rose-deep shrink-0">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="ai-settings-title" className="font-serif text-xl font-bold text-plum">
              AI Provider Settings
            </h2>
            <p className="text-xs text-mauve">
              Use Closer&apos;s hosted AI models or bring your own API key
            </p>
          </div>
        </div>

        {/* Mode Selector Radio Group */}
        <div className="mt-5 space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-mauve block">
            AI Engine Selection
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setMode("default");
                setTestResult(null);
              }}
              className={`flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all ${
                mode === "default"
                  ? "border-rose bg-blush/40 ring-1 ring-rose shadow-2xs"
                  : "border-border bg-paper hover:bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-rose-deep" aria-hidden="true" />
                <span className="text-xs font-bold text-plum">Closer&apos;s AI (Default)</span>
              </div>
              <p className="text-[11px] text-mauve mt-1">
                Zero setup. Uses Closer&apos;s managed multi-provider router.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("byok")}
              className={`flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all ${
                mode === "byok"
                  ? "border-rose bg-blush/40 ring-1 ring-rose shadow-2xs"
                  : "border-border bg-paper hover:bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-rose-deep" aria-hidden="true" />
                <span className="text-xs font-bold text-plum">My Own Key (BYOK)</span>
              </div>
              <p className="text-[11px] text-mauve mt-1">
                Use your private Groq or Google AI Studio key for higher rate limits.
              </p>
            </button>
          </div>
        </div>

        {/* BYOK Configuration Form */}
        {mode === "byok" && (
          <div className="mt-5 space-y-4 rounded-2xl border border-blush/80 bg-paper/50 p-4">
            {/* Provider Selection (Strictly Groq or Google) */}
            <div>
              <label htmlFor="byok-provider-select" className="block text-xs font-semibold text-plum">
                Select Provider
              </label>
              <select
                id="byok-provider-select"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as ByokProvider)}
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-xs text-plum focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
              >
                <option value="groq">Groq (Ultra-fast, Llama & GPT-OSS)</option>
                <option value="google">Google AI Studio (Gemini Flash Lite)</option>
              </select>
            </div>

            {/* Model Selection */}
            <div>
              <label htmlFor="byok-model-select" className="block text-xs font-semibold text-plum">
                Model
              </label>
              <select
                id="byok-model-select"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-xs text-plum focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep"
              >
                {PROVIDER_MODELS[provider].map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key Password Input */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="byok-api-key" className="text-xs font-semibold text-plum">
                  API Key
                </label>
                <span className="text-[10px] text-mauve">Session memory only</span>
              </div>

              <div className="relative mt-1">
                <input
                  id="byok-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder={provider === "groq" ? "gsk_..." : "AIzaSy..."}
                  className="w-full rounded-2xl border border-border bg-white pr-10 pl-3 py-2 text-xs text-plum placeholder:text-mauve/60 focus:border-rose focus-visible:outline-2 focus-visible:outline-rose-deep font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mauve hover:text-plum p-1"
                >
                  {showKey ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* Security Guarantee Notice */}
            <div className="flex items-start gap-2 rounded-xl bg-blush/40 p-2.5 text-[11px] text-mauve">
              <ShieldCheck className="size-4 text-rose shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                <strong>Zero disk persistence:</strong> Your key is stored strictly in this browser tab&apos;s session memory. It is sent encrypted over HTTPS directly with your requests and deleted the moment you close this tab.
              </span>
            </div>

            {/* Test Connection Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTesting || !apiKey.trim()}
                className="inline-flex items-center gap-1.5 rounded-full border border-mauve/30 bg-white px-4 py-1.5 text-xs font-semibold text-plum hover:bg-blush disabled:opacity-50 transition-colors"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin text-rose" aria-hidden="true" />
                    <span>Testing connection...</span>
                  </>
                ) : (
                  <span>Test Key</span>
                )}
              </button>
            </div>

            {/* Test Result Feedback */}
            {testResult && (
              <div
                role="status"
                className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-medium ${
                  testResult.success
                    ? "border border-sage/40 bg-sage/20 text-sage-deep"
                    : "border border-rose/30 bg-blush/60 text-rose-deep"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="size-4 shrink-0 text-sage-deep" aria-hidden="true" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-rose-deep" aria-hidden="true" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Saved Success Notice */}
        {savedSuccess && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/20 p-2.5 text-xs font-medium text-sage-deep"
          >
            <CheckCircle2 className="size-4 shrink-0 text-sage-deep" aria-hidden="true" />
            <span>Settings updated successfully!</span>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-blush pt-4">
          <div>
            {mode === "byok" && apiKey && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-semibold text-rose hover:underline"
              >
                Disconnect & Clear Key
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-mauve/20 bg-paper px-4 py-2 text-xs font-semibold text-plum hover:bg-blush transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-rose px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-deep transition-colors"
            >
              Save for this session
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
