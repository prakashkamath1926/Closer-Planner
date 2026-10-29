"use client";

import React, { useMemo } from "react";
import { X, AlertCircle } from "lucide-react";
import { VendorRecord, compareCategoryVendors } from "@/lib/engine/vendors";

interface VendorComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendors: VendorRecord[];
  category: string;
  currency: string;
}

export function VendorComparisonModal({
  isOpen,
  onClose,
  vendors,
  category,
  currency,
}: VendorComparisonModalProps) {
  const comparison = useMemo(() => {
    return compareCategoryVendors(vendors, category, currency);
  }, [vendors, category, currency]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-plum/50 p-4 backdrop-blur-xs"
    >
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-blush bg-white p-6 shadow-xl sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-blush pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-peach/40 px-2.5 py-0.5 text-xs font-semibold text-plum uppercase">
                {category}
              </span>
              <h3 id="comparison-title" className="font-serif text-xl font-bold text-plum">
                Side-by-Side Quote Comparison ({comparison.vendors.length} vendors)
              </h3>
            </div>
            <p className="mt-1 text-xs text-mauve">
              Comparing quoted figures, inclusions, missing terms, and priority fallback order.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-full p-1.5 text-mauve hover:bg-blush hover:text-plum transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Currency mismatch alert */}
        {comparison.hasIncomparablePrices && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Warning: Multiple currencies detected ({comparison.currencies.join(", ")}).</strong>{" "}
              Compare terms and exchange rates carefully before selecting.
            </span>
          </div>
        )}

        {comparison.vendors.length === 0 ? (
          <div className="py-12 text-center text-xs text-mauve">
            No vendors added in the {category} category yet.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-blush text-mauve font-semibold uppercase text-[11px]">
                  <th className="py-3 px-3 w-40">Attribute</th>
                  {comparison.vendors.map((v) => (
                    <th key={v.vendorId} className="py-3 px-3 min-w-[200px] bg-paper/50">
                      <div className="flex items-center justify-between">
                        <span className="font-serif text-sm font-bold text-plum">{v.name}</span>
                        <span className="rounded-full bg-rose/10 px-2 py-0.5 text-[10px] text-roseDeep font-semibold">
                          Priority #{v.priority}
                        </span>
                      </div>
                      <span className="text-[10px] text-mauve capitalize">Status: {v.status}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-blush/60">
                {/* Quoted Price */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-plum bg-paper/30">Quoted Price</td>
                  {comparison.vendors.map((v) => (
                    <td key={v.vendorId} className="py-3 px-3">
                      <span className="font-serif text-base font-bold text-plum">
                        {v.quotedPriceFormatted}
                      </span>
                      {v.priceMinorUnits === null && (
                        <span className="block text-[10px] text-roseDeep">⚠️ No price quoted</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Inclusions */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-plum bg-paper/30">
                    Included Services
                  </td>
                  {comparison.vendors.map((v) => (
                    <td key={v.vendorId} className="py-3 px-3 align-top">
                      <span className="font-medium text-plum">{v.includedCount} items included</span>
                      {v.includedItems.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-[11px] text-mauve space-y-0.5">
                          {v.includedItems.slice(0, 4).map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                          {v.includedItems.length > 4 && (
                            <li className="text-[10px] italic">+{v.includedItems.length - 4} more</li>
                          )}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Extra Fees */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-plum bg-paper/30">Extra Fees</td>
                  {comparison.vendors.map((v) => (
                    <td key={v.vendorId} className="py-3 px-3 align-top">
                      {v.extraFeesCount > 0 ? (
                        <ul className="list-disc pl-4 text-[11px] text-amber-800 space-y-0.5">
                          {v.extraFeesItems.map((fee, idx) => (
                            <li key={idx}>{fee}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-mauve text-[11px]">None stated</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Availability Claim */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-plum bg-paper/30">
                    Availability Statement
                  </td>
                  {comparison.vendors.map((v) => (
                    <td key={v.vendorId} className="py-3 px-3 align-top text-[11px]">
                      {v.hasAvailabilityClaim ? (
                        <span className="text-plum">{v.availabilityClaimText}</span>
                      ) : (
                        <span className="text-roseDeep">⚠️ Missing statement</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Cancellation Terms */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-plum bg-paper/30">
                    Cancellation Policy
                  </td>
                  {comparison.vendors.map((v) => (
                    <td key={v.vendorId} className="py-3 px-3 align-top text-[11px]">
                      {v.hasCancellationTerms ? (
                        <span className="text-plum">{v.cancellationTermsText}</span>
                      ) : (
                        <span className="text-roseDeep font-semibold">⚠️ Terms missing</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Missing & Incomparable Fields */}
                <tr>
                  <td className="py-3 px-3 font-semibold text-plum bg-paper/30">
                    Missing Information
                  </td>
                  {comparison.vendors.map((v) => (
                    <td key={v.vendorId} className="py-3 px-3 align-top">
                      {v.missingFields.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {v.missingFields.map((m, idx) => (
                            <span
                              key={idx}
                              className="rounded-full bg-rose/10 px-2 py-0.5 text-[10px] font-semibold text-roseDeep"
                            >
                              ⚠️ {m}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sageDeep font-medium text-[11px]">
                          ✓ Comprehensive quote
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
