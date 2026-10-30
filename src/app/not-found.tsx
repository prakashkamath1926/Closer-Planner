import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-blush text-rose">
        <Sparkles className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="mt-6 font-serif text-3xl font-bold text-plum sm:text-4xl">
        Celebration Plan Not Found
      </h1>
      <p className="mt-3 max-w-md text-sm text-mauve">
        We couldn&apos;t find this celebration plan. It may have expired, or you might be signed
        in with a different browser session.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}

