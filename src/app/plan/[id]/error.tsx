"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PlanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Plan page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-rose/10 text-3xl text-rose">
        !
      </div>
      <h1 className="mt-6 font-serif text-3xl font-bold text-plum sm:text-4xl">
        Something went wrong loading this plan
      </h1>
      <p className="mt-3 max-w-md text-sm text-mauve">
        {error?.message || "An unexpected error occurred while loading your celebration plan."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Button onClick={() => reset()} size="lg">
          Try Again
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
