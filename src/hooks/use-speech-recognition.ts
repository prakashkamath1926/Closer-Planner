"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type SpeechState = "idle" | "listening" | "error";

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  state: SpeechState;
  errorMessage: string | null;
  startListening: () => void;
  stopListening: () => void;
  lang: string;
  setLang: (lang: string) => void;
}

// Browser Web Speech API type definitions
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [itemIndex: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionError {
  error: string;
}

type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionError) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useSpeechRecognition({
  lang: initialLang = "en-US",
  onResult,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  });
  const [state, setState] = useState<SpeechState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lang, setLang] = useState(initialLang);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
    }
    setState("idle");
  }, []);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    setErrorMessage(null);

    // Stop existing instance if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onstart = () => {
        setState("listening");
        setErrorMessage(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcriptSegment = item[0]?.transcript || "";
          if (item.isFinal) {
            finalText += transcriptSegment;
          } else {
            interimText += transcriptSegment;
          }
        }

        const combined = finalText || interimText;
        if (combined && onResultRef.current) {
          onResultRef.current(combined, Boolean(finalText));
        }
      };

      recognition.onerror = (event: SpeechRecognitionError) => {
        let message = "Speech recognition encountered an issue.";
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          message = "Microphone access was denied. You can continue typing directly.";
        } else if (event.error === "no-speech") {
          message = "No speech detected. You can speak again or type directly.";
        } else if (event.error === "network") {
          message = "Network connection interrupted speech recognition.";
        } else if (event.error === "aborted") {
          setState("idle");
          return;
        }

        setState("error");
        setErrorMessage(message);
        if (onErrorRef.current) {
          onErrorRef.current(message);
        }
      };

      recognition.onend = () => {
        setState((current) => (current === "listening" ? "idle" : current));
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: unknown) {
      setState("error");
      const msg = err instanceof Error ? err.message : "Could not activate microphone.";
      setErrorMessage(msg);
      if (onErrorRef.current) {
        onErrorRef.current(msg);
      }
    }
  }, [lang]);

  // Keyboard accessibility: Escape stops listening
  useEffect(() => {
    if (state !== "listening") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopListening();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [state, stopListening]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    state,
    errorMessage,
    startListening,
    stopListening,
    lang,
    setLang,
  };
}
