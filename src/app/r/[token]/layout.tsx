import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Something special is being prepared",
  description: "A celebration is being prepared.",
  openGraph: {
    title: "Something special is being prepared",
    description: "A celebration is being prepared.",
  },
  twitter: {
    card: "summary",
    title: "Something special is being prepared",
    description: "A celebration is being prepared.",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RecipientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}

