"use client";

import React, { useState } from "react";
import { X, Mail, MessageSquare } from "lucide-react";
import { draftVendorInquiry } from "@/lib/engine/vendors";

interface VendorInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorName: string;
  category: string;
  contact?: string | null;
  occasionTitle: string;
  eventDate?: string | null;
  guestCount?: number | null;
  questions?: string[];
}

export function VendorInquiryModal({
  isOpen,
  onClose,
  vendorName,
  category,
  contact,
  occasionTitle,
  eventDate,
  guestCount,
  questions,
}: VendorInquiryModalProps) {
  const initialDraft = draftVendorInquiry({
    vendorName,
    category,
    occasionTitle,
    eventDate,
    guestCount,
    questions,
    contact,
  });

  const [subject, setSubject] = useState(initialDraft.subject);
  const [bodyText, setBodyText] = useState(initialDraft.bodyText);
  const [contactInput, setContactInput] = useState(contact || "");

  if (!isOpen) return null;

  // Recalculate URLs when edited
  const digits = contactInput.replace(/[^0-9]/g, "");
  const whatsappUrl =
    digits.length >= 10 ? `https://wa.me/${digits}?text=${encodeURIComponent(bodyText)}` : null;

  const emailMatch = contactInput.includes("@")
    ? contactInput.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    : null;
  const mailtoUrl = emailMatch
    ? `mailto:${emailMatch[0]}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
    : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inquiry-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-plum/50 p-4 backdrop-blur-xs"
    >
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-blush bg-white p-6 shadow-xl sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-blush pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-peach/40 px-2.5 py-0.5 text-xs font-semibold text-plum uppercase">
                {category}
              </span>
              <h3 id="inquiry-modal-title" className="font-serif text-xl font-bold text-plum">
                Draft Inquiry: {vendorName}
              </h3>
            </div>
            <p className="mt-1 text-xs text-mauve">
              Review and edit your message. Nothing is sent automatically.
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

        {/* Contact Input */}
        <div className="mt-4">
          <label
            htmlFor="vendor-contact"
            className="block text-xs font-semibold text-plum uppercase tracking-wider"
          >
            Vendor Phone or Email
          </label>
          <input
            id="vendor-contact"
            type="text"
            value={contactInput}
            onChange={(e) => setContactInput(e.target.value)}
            placeholder="e.g. +91 9876543210 or contact@vendor.com"
            className="mt-1.5 w-full rounded-2xl border border-blush bg-paper px-4 py-2.5 text-xs text-plum focus:border-rose focus:ring-1 focus:ring-rose focus:outline-hidden"
          />
        </div>

        {/* Subject */}
        <div className="mt-4">
          <label
            htmlFor="inquiry-subject"
            className="block text-xs font-semibold text-plum uppercase tracking-wider"
          >
            Subject Line
          </label>
          <input
            id="inquiry-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-blush bg-paper px-4 py-2.5 text-xs text-plum focus:border-rose focus:ring-1 focus:ring-rose focus:outline-hidden"
          />
        </div>

        {/* Body Text */}
        <div className="mt-4">
          <label
            htmlFor="inquiry-body"
            className="block text-xs font-semibold text-plum uppercase tracking-wider"
          >
            Message Body
          </label>
          <textarea
            id="inquiry-body"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={8}
            className="mt-1.5 w-full rounded-2xl border border-blush bg-paper px-4 py-3 text-xs text-plum font-mono focus:border-rose focus:ring-1 focus:ring-rose focus:outline-hidden"
          />
        </div>

        {/* Action Buttons */}
        <div className="mt-6 border-t border-blush pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[11px] text-mauve">
            Direct client links: opens your email client or WhatsApp.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Open in WhatsApp</span>
              </a>
            )}
            <a
              href={mailtoUrl}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Open in Email</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
