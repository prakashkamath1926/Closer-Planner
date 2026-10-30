"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { ClientDateTime } from "@/components/client-date-time";

export interface VersionItem {
  id: string;
  version_no: number;
  change_summary: string | null;
  created_at: string;
}

interface VersionDrawerProps {
  isOpen: boolean;
  versions: VersionItem[];
  currentVersionNo: number;
  occasionId: string;
  onClose: () => void;
  onVersionRestored: (newVersionNo: number) => void;
}

export function VersionDrawer({
  isOpen,
  versions,
  currentVersionNo,
  occasionId,
  onClose,
  onVersionRestored,
}: VersionDrawerProps) {
  const [isRestoring, setIsRestoring] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRestore = async (versionNo: number) => {
    if (!confirm(`Restore Version ${versionNo}? Your current plan will be saved as a new version so you can undo anytime.`)) {
      return;
    }

    setIsRestoring(versionNo);
    setError(null);

    try {
      const res = await fetch("/api/versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          targetVersionNo: versionNo,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restore version.");
      }

      const data = await res.json();
      onVersionRestored(data.newVersionNo);
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to restore version.");
    } finally {
      setIsRestoring(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-plum/40 backdrop-blur-xs">
      <div className="h-full w-full max-w-md border-l border-blush bg-paper p-6 shadow-2xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-blush pb-4">
            <div>
              <span className="text-xs font-semibold tracking-wider text-mauve uppercase">
                History & Undo
              </span>
              <h3 className="font-serif text-xl font-bold text-plum">
                Plan Versions
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-2 text-mauve hover:bg-blush hover:text-plum transition-colors"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-3 text-xs text-mauve">
            Every approved change creates a snapshot. Restoring a version reproduces that exact snapshot and keeps your replaced state as a new version.
          </p>

          {error && (
            <div className="mt-4 rounded-2xl bg-rose/10 p-3 text-xs text-roseDeep">
              {error}
            </div>
          )}

          {/* List of versions */}
          <div className="mt-6 space-y-3 overflow-y-auto max-h-[70vh] pr-1">
            {versions.length === 0 ? (
              <p className="py-8 text-center text-xs text-mauve">
                No previous versions yet. Changes you make will be preserved here.
              </p>
            ) : (
              versions.map((ver) => {
                const isCurrent = ver.version_no === currentVersionNo;

                return (
                  <div
                    key={ver.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      isCurrent
                        ? "border-rose bg-white shadow-xs"
                        : "border-blush bg-white hover:border-mauve/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-plum">
                        Version {ver.version_no}
                      </span>
                      <ClientDateTime
                        date={ver.created_at}
                        options={{
                          dateStyle: "medium",
                          timeStyle: "short",
                        }}
                        className="text-[10px] text-mauve"
                      />
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-mauve">
                      {ver.change_summary || "Plan updated."}
                    </p>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-blush/60">
                      {isCurrent ? (
                        <span className="text-[11px] font-semibold text-rose">
                          ● Current Live Plan
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isRestoring !== null}
                          onClick={() => handleRestore(ver.version_no)}
                          className="rounded-full border border-mauve/20 bg-paper px-3 py-1 text-xs font-semibold text-plum hover:bg-blush transition-colors disabled:opacity-50"
                        >
                          {isRestoring === ver.version_no ? "Restoring..." : "Restore this snapshot"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-blush">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-mauve/20 bg-white py-2.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
          >
            Close History
          </button>
        </div>
      </div>
    </div>
  );
}

