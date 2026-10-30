"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Users,
  Plus,
  Sparkles,
  FileText,
  Mail,
  Scale,
  Trash2,
  AlertCircle,
  Phone,
  Lightbulb,
  CheckCircle2,
  Handshake,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { VendorRecord, VendorStatus } from "@/lib/engine/vendors";
import { formatMoney } from "@/lib/engine/money";
import { QuoteParseModal } from "./quote-parse-modal";
import { VendorComparisonModal } from "./vendor-comparison-modal";
import { VendorInquiryModal } from "./vendor-inquiry-modal";

interface VendorSectionProps {
  occasionId: string;
  occasionTitle: string;
  eventDate?: string | null;
  guestCount?: number | null;
  currency: string;
  onVendorsCountChange?: (count: number) => void;
}

const STATUS_CONFIG: Record<
  VendorStatus,
  { label: string; bg: string; text: string; Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }> }
> = {
  suggested: { label: "Suggested", bg: "bg-butter/40", text: "text-amber-900", Icon: Lightbulb },
  verified: { label: "Verified", bg: "bg-sage/40", text: "text-sageDeep", Icon: CheckCircle2 },
  contacted: { label: "Contacted", bg: "bg-lavender/40", text: "text-plum", Icon: Mail },
  confirmed: { label: "Confirmed", bg: "bg-emerald-100", text: "text-emerald-800", Icon: Handshake },
  declined: { label: "Declined", bg: "bg-rose/15", text: "text-roseDeep", Icon: XCircle },
};

export function VendorSection({
  occasionId,
  occasionTitle,
  eventDate,
  guestCount,
  currency,
  onVendorsCountChange,
}: VendorSectionProps) {
  const [vendors, setVendors] = useState<VendorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const onVendorsCountChangeRef = useRef(onVendorsCountChange);
  useEffect(() => {
    onVendorsCountChangeRef.current = onVendorsCountChange;
  });

  // Fallback notification state when a vendor is marked declined
  const [declinedNotice, setDeclinedNotice] = useState<{
    declinedVendorName: string;
    nextFallback: VendorRecord | null;
  } | null>(null);

  // Add Vendor Form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Venue");
  const [newContact, setNewContact] = useState("");
  const [newPriority, setNewPriority] = useState(1);
  const [creating, setCreating] = useState(false);

  // Category questions state
  const [categoryQuestions, setCategoryQuestions] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Modals state
  const [activeParseVendor, setActiveParseVendor] = useState<VendorRecord | null>(null);
  const [activeCompareCategory, setActiveCompareCategory] = useState<string | null>(null);
  const [activeInquiryVendor, setActiveInquiryVendor] = useState<VendorRecord | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchVendors() {
      try {
        const res = await fetch(`/api/vendors?occasionId=${occasionId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setVendors(data.vendors || []);
            onVendorsCountChangeRef.current?.(data.vendors?.length || 0);
          }
        }
      } catch (err) {
        console.error("Failed to load vendors:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchVendors();

    return () => {
      isMounted = false;
    };
  }, [occasionId, refreshKey]);

  // Handle Status Update
  const handleStatusChange = async (vendor: VendorRecord, nextStatus: VendorStatus) => {
    try {
      const res = await fetch("/api/vendors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: vendor.id,
          occasionId,
          status: nextStatus,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update vendor status");
        return;
      }

      const data = await res.json();
      setVendors((prev) => prev.map((v) => (v.id === vendor.id ? data.vendor : v)));

      if (nextStatus === "declined") {
        setDeclinedNotice({
          declinedVendorName: vendor.name,
          nextFallback: data.nextFallback,
        });
      }
    } catch (err) {
      console.error(err);
      alert("Error updating vendor status");
    }
  };

  // Handle Delete Vendor
  const handleDeleteVendor = async (vendorId: string) => {
    if (!confirm("Are you sure you want to remove this vendor?")) return;
    try {
      const res = await fetch(`/api/vendors?id=${vendorId}&occasionId=${occasionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setVendors((prev) => prev.filter((v) => v.id !== vendorId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Create Vendor
  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setCreating(true);
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occasionId,
          name: newName.trim(),
          category: newCategory.trim(),
          contact: newContact.trim() || null,
          priority: Number(newPriority) || 1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setVendors((prev) => [...prev, data.vendor]);
        setNewName("");
        setNewContact("");
        setIsAddOpen(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  // Fetch Questions to Ask
  const handleFetchQuestions = async (cat: string) => {
    try {
      setLoadingQuestions(true);
      const res = await fetch("/api/vendors/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, occasionType: "celebration" }),
      });
      if (res.ok) {
        const data = await res.json();
        setCategoryQuestions(data.questions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Group vendors by category
  const categories = useMemo(() => {
    const set = new Set<string>();
    vendors.forEach((v) => set.add(v.category));
    return Array.from(set);
  }, [vendors]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-blush bg-white p-6 shadow-xs animate-pulse">
        <div className="h-5 w-48 rounded-full bg-blush" />
        <div className="mt-3 h-3 w-72 rounded-full bg-blush/60" />
      </div>
    );
  }

  return (
    <section aria-labelledby="vendors-heading" className="rounded-3xl border border-rose/20 bg-white p-6 shadow-sm sm:p-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center border-b border-blush pb-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-lavender/40 text-plum shadow-xs">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 id="vendors-heading" className="font-serif text-lg font-bold text-plum sm:text-xl">
                Vendor Checklist & Quote Comparison
              </h3>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-mauve">
                {vendors.length} vendors
              </span>
            </div>
            <p className="mt-1 text-xs text-mauve">
              Status changes strictly by explicit organizer action. Pasted quotes are stored as QUOTED unverified claims.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-rose px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Vendor</span>
        </button>
      </div>

      {/* Fallback Notification Banner */}
      {declinedNotice && (
        <div className="mt-5 flex flex-col justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>{declinedNotice.declinedVendorName}</strong> marked as declined.{" "}
              {declinedNotice.nextFallback ? (
                <span>
                  Next fallback: <strong>{declinedNotice.nextFallback.name}</strong> (Priority #{declinedNotice.nextFallback.priority}).
                </span>
              ) : (
                <span>No fallback vendor available in this category yet.</span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDeclinedNotice(null)}
            className="text-xs font-semibold text-amber-800 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Vendor List */}
      {vendors.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-peach/40 text-plum">
            <Handshake className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-2 font-serif text-base font-semibold text-plum">
            No vendors added yet
          </p>
          <p className="mt-1 text-xs text-mauve">
            Add venues, caterers, photographers, and decorators to compare quotes and track fallbacks.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {categories.map((cat) => {
            const catVendors = vendors
              .filter((v) => v.category === cat)
              .sort((a, b) => a.priority - b.priority);

            return (
              <div key={cat} className="rounded-2xl border border-blush bg-paper/30 p-4">
                <div className="flex items-center justify-between border-b border-blush/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-base font-bold text-plum">{cat}</span>
                    <span className="rounded-full bg-peach/30 px-2 py-0.5 text-[10px] font-semibold text-plum">
                      {catVendors.length} options
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveCompareCategory(cat)}
                    className="inline-flex items-center gap-1 rounded-full border border-mauve/20 bg-white px-3 py-1 text-xs font-medium text-plum hover:bg-blush transition-colors"
                  >
                    <Scale className="h-3.5 w-3.5 text-mauve" />
                    <span>Compare {cat} Quotes</span>
                  </button>
                </div>

                <div className="mt-3 divide-y divide-blush/60">
                  {catVendors.map((vendor) => {
                    const statusCfg = STATUS_CONFIG[vendor.status] || STATUS_CONFIG.suggested;
                    const qf = (vendor.quote_fields || {}) as { price?: number; included?: string[] };
                    const hasParsedQuote = qf && typeof qf.price === "number";

                    return (
                      <div
                        key={vendor.id}
                        className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
                      >
                        {/* Vendor Info */}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-serif text-sm font-bold text-plum">
                              {vendor.name}
                            </span>
                            <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-mauve">
                              Priority #{vendor.priority}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}
                            >
                              <statusCfg.Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span>{statusCfg.label}</span>
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-mauve">
                            {vendor.contact && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-mauve" />
                                <span>{vendor.contact}</span>
                              </span>
                            )}
                            <span>
                              Quote:{" "}
                              <strong>
                                {vendor.quote_amount !== null
                                  ? formatMoney(vendor.quote_amount, currency)
                                  : "Pending"}
                              </strong>
                            </span>
                            {hasParsedQuote && (
                              <span className="inline-flex items-center gap-1 text-amber-800 font-medium text-[11px]">
                                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span>Quoted breakdown saved</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Quote Parse Button */}
                          <button
                            type="button"
                            onClick={() => setActiveParseVendor(vendor)}
                            className="inline-flex items-center gap-1 rounded-full border border-mauve/20 bg-white px-3 py-1 text-xs font-semibold text-plum hover:bg-blush transition-colors"
                          >
                            <FileText className="h-3 w-3 text-mauve" />
                            <span>{hasParsedQuote ? "View Quote" : "Parse Quote"}</span>
                          </button>

                          {/* Draft Message Button */}
                          <button
                            type="button"
                            onClick={() => setActiveInquiryVendor(vendor)}
                            className="inline-flex items-center gap-1 rounded-full border border-mauve/20 bg-white px-3 py-1 text-xs font-semibold text-plum hover:bg-blush transition-colors"
                          >
                            <Mail className="h-3 w-3 text-mauve" />
                            <span>Draft Inquiry</span>
                          </button>

                          {/* Status Ladder Select */}
                          <select
                            aria-label={`Status for ${vendor.name}`}
                            value={vendor.status}
                            onChange={(e) =>
                              handleStatusChange(vendor, e.target.value as VendorStatus)
                            }
                            className="rounded-full border border-blush bg-paper px-2.5 py-1 text-xs font-semibold text-plum focus:border-rose focus:ring-1 focus:ring-rose"
                          >
                            <option value="suggested">Suggested</option>
                            <option value="verified">Verified</option>
                            <option value="contacted">Contacted</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="declined">Declined</option>
                          </select>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteVendor(vendor.id)}
                            aria-label={`Delete ${vendor.name}`}
                            className="rounded-full p-1.5 text-mauve/60 hover:text-rose transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Vendor Dialog */}
      {isAddOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-plum/50 p-4 backdrop-blur-xs"
        >
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-blush bg-white p-6 shadow-xl sm:p-8">
            <div className="flex items-center justify-between border-b border-blush pb-3">
              <h3 className="font-serif text-lg font-bold text-plum">Add Potential Vendor</h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-xs text-mauve hover:text-plum"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateVendor} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-plum uppercase tracking-wider">
                  Vendor Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Royal Heritage Garden"
                  className="mt-1 w-full rounded-2xl border border-blush bg-paper px-4 py-2.5 text-xs text-plum focus:border-rose focus:ring-1 focus:ring-rose"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="vendor-category-select" className="block text-xs font-semibold text-plum uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    id="vendor-category-select"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-blush bg-paper px-3 py-2.5 text-xs text-plum focus:border-rose focus:ring-1 focus:ring-rose"
                  >
                    <option value="Venue">Venue</option>
                    <option value="Catering">Catering</option>
                    <option value="Photography">Photography</option>
                    <option value="Decor">Decor</option>
                    <option value="Music & Entertainment">Music & Entertainment</option>
                    <option value="Cake & Desserts">Cake & Desserts</option>
                    <option value="Transport">Transport</option>
                    <option value="Gift">Gift</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-plum uppercase tracking-wider">
                    Priority / Fallback Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newPriority}
                    onChange={(e) => setNewPriority(Number(e.target.value))}
                    className="mt-1 w-full rounded-2xl border border-blush bg-paper px-3 py-2.5 text-xs text-plum focus:border-rose focus:ring-1 focus:ring-rose"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-plum uppercase tracking-wider">
                  Contact Phone or Email (Optional)
                </label>
                <input
                  type="text"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  placeholder="+91 9876543210 or inquiries@vendor.com"
                  className="mt-1 w-full rounded-2xl border border-blush bg-paper px-4 py-2.5 text-xs text-plum focus:border-rose focus:ring-1 focus:ring-rose"
                />
              </div>

              {/* Get Questions to Ask */}
              <div className="border-t border-blush pt-3">
                <button
                  type="button"
                  onClick={() => handleFetchQuestions(newCategory)}
                  disabled={loadingQuestions}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-roseDeep hover:underline"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>
                    {loadingQuestions
                      ? "Generating..."
                      : `View questions to ask for ${newCategory}`}
                  </span>
                </button>

                {categoryQuestions.length > 0 && (
                  <div className="mt-2 rounded-xl border border-sage/40 bg-sage/10 p-3 text-xs text-plum">
                    <span className="font-semibold text-sageDeep uppercase text-[10px]">
                      Recommended questions:
                    </span>
                    <ul className="mt-1 space-y-1 list-disc pl-4 text-[11px]">
                      {categoryQuestions.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-blush pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold text-mauve hover:text-plum"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="rounded-full bg-rose px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep disabled:opacity-50 transition-colors"
                >
                  {creating ? "Adding..." : "Add Vendor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quote Parse Modal */}
      {activeParseVendor && (
        <QuoteParseModal
          isOpen={Boolean(activeParseVendor)}
          onClose={() => setActiveParseVendor(null)}
          vendorId={activeParseVendor.id}
          vendorName={activeParseVendor.name}
          category={activeParseVendor.category}
          occasionId={occasionId}
          currency={currency}
          existingNotes={activeParseVendor.quote_notes}
          existingFields={activeParseVendor.quote_fields}
          onQuoteSaved={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {/* Side-by-Side Comparison Modal */}
      {activeCompareCategory && (
        <VendorComparisonModal
          isOpen={Boolean(activeCompareCategory)}
          onClose={() => setActiveCompareCategory(null)}
          vendors={vendors}
          category={activeCompareCategory}
          currency={currency}
        />
      )}

      {/* Draft Inquiry Modal */}
      {activeInquiryVendor && (
        <VendorInquiryModal
          isOpen={Boolean(activeInquiryVendor)}
          onClose={() => setActiveInquiryVendor(null)}
          vendorName={activeInquiryVendor.name}
          category={activeInquiryVendor.category}
          contact={activeInquiryVendor.contact}
          occasionTitle={occasionTitle}
          eventDate={eventDate}
          guestCount={guestCount}
        />
      )}
    </section>
  );
}
