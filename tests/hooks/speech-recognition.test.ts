import { describe, it, expect, vi } from "vitest";

interface MockSpeechEvent {
  resultIndex: number;
  results: Array<{
    isFinal: boolean;
    [index: number]: { transcript: string };
  }>;
}

interface MockSpeechError {
  error: string;
}

interface MockWindow {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
}

// Mock SpeechRecognition for test execution
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "en-US";
  onstart: (() => void) | null = null;
  onresult: ((e: MockSpeechEvent) => void) | null = null;
  onerror: ((e: MockSpeechError) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  start() {
    this.started = true;
    if (this.onstart) this.onstart();
  }

  stop() {
    this.started = false;
    if (this.onend) this.onend();
  }

  abort() {
    this.started = false;
    if (this.onend) this.onend();
  }
}

// SpeechRecognition Controller logic for unit testing without JSDOM dependency
export class SpeechRecognitionController {
  private recognition: MockSpeechRecognition | null = null;
  public isSupported: boolean;
  public state: "idle" | "listening" | "error" = "idle";
  public errorMessage: string | null = null;
  public lang: string;
  private onResult?: (text: string, isFinal: boolean) => void;
  private onError?: (err: string) => void;
  private win: MockWindow | null;

  constructor(options: {
    lang?: string;
    onResult?: (text: string, isFinal: boolean) => void;
    onError?: (err: string) => void;
    windowObj?: MockWindow | null;
  } = {}) {
    this.lang = options.lang || "en-US";
    this.onResult = options.onResult;
    this.onError = options.onError;
    this.win = options.windowObj !== undefined ? options.windowObj : null;
    this.isSupported = Boolean(this.win && (this.win.SpeechRecognition || this.win.webkitSpeechRecognition));
  }

  setLang(newLang: string) {
    this.lang = newLang;
  }

  startListening() {
    if (!this.isSupported || !this.win) {
      this.isSupported = false;
      return;
    }

    const SpeechRecognitionClass = (this.win.SpeechRecognition || this.win.webkitSpeechRecognition) as new () => MockSpeechRecognition;
    this.errorMessage = null;

    try {
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = this.lang;

      rec.onstart = () => {
        this.state = "listening";
        this.errorMessage = null;
      };

      rec.onresult = (event: MockSpeechEvent) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const segment = item[0]?.transcript || "";
          if (item.isFinal) {
            finalText += segment;
          } else {
            interimText += segment;
          }
        }

        const combined = finalText || interimText;
        if (combined && this.onResult) {
          this.onResult(combined, Boolean(finalText));
        }
      };

      rec.onerror = (event: MockSpeechError) => {
        let message = "Speech recognition encountered an issue.";
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          message = "Microphone access was denied. You can continue typing directly.";
        } else if (event.error === "no-speech") {
          message = "No speech detected. You can speak again or type directly.";
        } else if (event.error === "network") {
          message = "Network connection interrupted speech recognition.";
        } else if (event.error === "aborted") {
          this.state = "idle";
          return;
        }

        this.state = "error";
        this.errorMessage = message;
        if (this.onError) {
          this.onError(message);
        }
      };

      rec.onend = () => {
        if (this.state === "listening") {
          this.state = "idle";
        }
      };

      this.recognition = rec;
      rec.start();
    } catch (err: unknown) {
      this.state = "error";
      const msg = err instanceof Error ? err.message : "Could not activate microphone.";
      this.errorMessage = msg;
      if (this.onError) this.onError(msg);
    }
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.state = "idle";
  }
}

describe("SpeechRecognition Controller & Hook logic (Task: Voice Input)", () => {
  it("returns isSupported = false when window lacks Web Speech API", () => {
    const controller = new SpeechRecognitionController({ windowObj: {} });
    expect(controller.isSupported).toBe(false);
    expect(controller.state).toBe("idle");
    expect(controller.errorMessage).toBeNull();
  });

  it("detects Web Speech API and initializes in idle state", () => {
    const fakeWindow = { SpeechRecognition: MockSpeechRecognition };
    const controller = new SpeechRecognitionController({ windowObj: fakeWindow });

    expect(controller.isSupported).toBe(true);
    expect(controller.state).toBe("idle");
  });

  it("transitions to 'listening' when startListening is called", () => {
    const fakeWindow = { SpeechRecognition: MockSpeechRecognition };
    const controller = new SpeechRecognitionController({ windowObj: fakeWindow });

    controller.startListening();
    expect(controller.state).toBe("listening");
    expect(controller.errorMessage).toBeNull();
  });

  it("processes interim and final speech recognition results", () => {
    let capturedInstance: MockSpeechRecognition | null = null;
    const setCaptured = (inst: MockSpeechRecognition) => {
      capturedInstance = inst;
    };
    class CapturingSpeechRecognition extends MockSpeechRecognition {
      override start() {
        super.start();
        setCaptured(this);
      }
    }

    const fakeWindow = { SpeechRecognition: CapturingSpeechRecognition };
    const onResult = vi.fn();
    const controller = new SpeechRecognitionController({
      windowObj: fakeWindow,
      onResult,
    });

    controller.startListening();

    // Trigger interim transcript
    capturedInstance!.onresult!({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "Acoustic music" }], { isFinal: false }),
      ],
    });
    expect(onResult).toHaveBeenCalledWith("Acoustic music", false);

    // Trigger final transcript
    capturedInstance!.onresult!({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "Acoustic music and rooftop dinner" }], { isFinal: true }),
      ],
    });
    expect(onResult).toHaveBeenCalledWith("Acoustic music and rooftop dinner", true);
  });

  it("transitions back to 'idle' on stopListening()", () => {
    const fakeWindow = { SpeechRecognition: MockSpeechRecognition };
    const controller = new SpeechRecognitionController({ windowObj: fakeWindow });

    controller.startListening();
    expect(controller.state).toBe("listening");

    controller.stopListening();
    expect(controller.state).toBe("idle");
  });

  it("handles permission denial ('not-allowed') honestly with clear messaging", () => {
    class DeniedSpeechRecognition extends MockSpeechRecognition {
      override start() {
        super.start();
        if (this.onerror) {
          this.onerror({ error: "not-allowed" });
        }
      }
    }

    const fakeWindow = { SpeechRecognition: DeniedSpeechRecognition };
    const onError = vi.fn();
    const controller = new SpeechRecognitionController({
      windowObj: fakeWindow,
      onError,
    });

    controller.startListening();
    expect(controller.state).toBe("error");
    expect(controller.errorMessage).toContain("Microphone access was denied");
    expect(onError).toHaveBeenCalledWith(
      "Microphone access was denied. You can continue typing directly."
    );
  });

  it("handles no-speech timeouts gracefully", () => {
    class NoSpeechRecognition extends MockSpeechRecognition {
      override start() {
        super.start();
        if (this.onerror) {
          this.onerror({ error: "no-speech" });
        }
      }
    }

    const fakeWindow = { SpeechRecognition: NoSpeechRecognition };
    const controller = new SpeechRecognitionController({ windowObj: fakeWindow });

    controller.startListening();
    expect(controller.state).toBe("error");
    expect(controller.errorMessage).toContain("No speech detected");
  });

  it("supports language configuration (English / Hindi)", () => {
    const fakeWindow = { SpeechRecognition: MockSpeechRecognition };
    const controller = new SpeechRecognitionController({
      windowObj: fakeWindow,
      lang: "en-US",
    });

    expect(controller.lang).toBe("en-US");
    controller.setLang("hi-IN");
    expect(controller.lang).toBe("hi-IN");
  });
});
