"use client";

import { openAiSettingsDialog } from "@/lib/ai/byok-client";
import { AiSettingsDialog } from "@/components/ai/ai-settings-dialog";

export function Footer() {
  return (
    <>
      <footer className="border-t border-border bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
          <p className="font-hand text-xl text-plum">Made with care, for someone you love.</p>
          <div className="flex items-center gap-3">
            <p>AI suggestions are proposals. You review and approve every decision.</p>
            <span aria-hidden="true" className="text-mauve/40">•</span>
            <button
              type="button"
              onClick={openAiSettingsDialog}
              className="text-xs font-semibold text-rose hover:text-rose-deep underline cursor-pointer"
            >
              AI settings
            </button>
          </div>
        </div>
      </footer>
      <AiSettingsDialog />
    </>
  );
}
