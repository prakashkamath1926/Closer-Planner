import type { Metadata } from "next";
import { ContributeForm } from "./contribute-form";

export const metadata: Metadata = {
  title: "Write a letter",
  description: "Share a heartfelt message or memory.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  referrer: "no-referrer",
};

interface ContributePageProps {
  params: Promise<{ token: string }>;
}

export default async function ContributePage({ params }: ContributePageProps) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-paper px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg">
        <ContributeForm token={token} />
      </div>
    </main>
  );
}
