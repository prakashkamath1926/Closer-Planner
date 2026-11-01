import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import "./globals.css";
import { Footer } from "@/components/app-shell/footer";
import { Header } from "@/components/app-shell/header";
import { SessionBootstrapper } from "@/components/session-bootstrapper";

// Self-hosted variable fonts (SIL Open Font License, see src/fonts/LICENSE-*.txt).
const fraunces = localFont({
  src: "../fonts/fraunces-latin-wght-normal.woff2",
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
});

const dmSans = localFont({
  src: "../fonts/dm-sans-latin-wght-normal.woff2",
  variable: "--font-dm-sans",
  weight: "100 1000",
  display: "swap",
});

const caveat = localFont({
  src: "../fonts/caveat-latin-wght-normal.woff2",
  variable: "--font-caveat",
  weight: "400 700",
  display: "swap",
});

import { APP_NAME, TAGLINE } from "@/lib/brand";
import { CustomCursor } from "@/components/ui/custom-cursor";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — ${TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description: TAGLINE,
  openGraph: {
    title: `${APP_NAME} — ${TAGLINE}`,
    description: TAGLINE,
    siteName: APP_NAME,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${caveat.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "globalThis.__zod_globalConfig={jitless:true};",
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        {/*
         * SessionBootstrapper is behind Suspense because it reads cookies()
         * via the server Supabase client. With cacheComponents enabled, any
         * cookie read outside a Suspense boundary is a build error.
         * The fallback is null: the bootstrapper has no visible output.
         */}
        <Suspense fallback={null}>
          <SessionBootstrapper />
        </Suspense>
        <a
          href="#main"
          className="sr-only rounded-2xl bg-plum px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to main content
        </a>
        <Header />
        <CustomCursor />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
