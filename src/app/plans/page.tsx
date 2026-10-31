import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Calendar, ArrowRight, Heart, Sparkles, Plus } from "lucide-react";
import { ClientDateTime } from "@/components/client-date-time";

export const metadata = {
  title: "My Celebration Plans",
  description: "View and continue planning your celebrations.",
};

async function PlansList() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="rounded-3xl border border-blush bg-white p-8 text-center shadow-xs">
        <Heart className="mx-auto size-10 text-rose/60 mb-3" aria-hidden="true" />
        <h2 className="font-serif text-2xl font-bold text-plum">No plans found</h2>
        <p className="mt-2 text-sm text-mauve">
          Sign in or create a celebration to view your saved plans here.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/#intake"
            className="inline-flex items-center gap-2 rounded-full bg-rose px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Start a celebration</span>
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-mauve/20 bg-paper px-5 py-2.5 text-xs font-semibold text-plum hover:bg-blush transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const { data: occasions } = await supabase
    .from("occasions")
    .select("id, title, occasion_type, recipient_name, event_at, status, updated_at, budget_total, currency")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (!occasions || occasions.length === 0) {
    return (
      <div className="rounded-3xl border border-blush bg-white p-8 text-center shadow-xs">
        <Sparkles className="mx-auto size-10 text-rose/60 mb-3" aria-hidden="true" />
        <h2 className="font-serif text-2xl font-bold text-plum">No celebration plans yet</h2>
        <p className="mt-2 text-sm text-mauve">
          Start thoughtful celebration planning for someone special.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/#intake"
            className="inline-flex items-center gap-2 rounded-full bg-rose px-6 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Create your first plan</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {occasions.map((occ) => (
        <div
          key={occ.id}
          className="flex flex-col justify-between rounded-3xl border border-blush bg-white p-6 shadow-xs hover:shadow-md transition-shadow"
        >
          <div>
            <div className="flex items-center justify-between text-xs text-mauve">
              <span className="capitalize font-semibold text-rose-deep">
                {occ.occasion_type}
              </span>
              <span className="rounded-full bg-peach/40 px-2 py-0.5 text-[11px] font-medium text-plum capitalize">
                {occ.status}
              </span>
            </div>

            <h3 className="mt-2 font-serif text-xl font-bold text-plum">
              {occ.title}
            </h3>

            {occ.recipient_name && (
              <p className="mt-1 text-xs text-mauve">
                For {occ.recipient_name}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 text-xs text-mauve">
              <Calendar className="size-3.5 text-mauve/70 shrink-0" aria-hidden="true" />
              {occ.event_at ? (
                <ClientDateTime
                  date={occ.event_at}
                  options={{ dateStyle: "medium" }}
                />
              ) : (
                <span>Date not set</span>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-blush flex items-center justify-between">
            <span className="text-xs font-semibold text-plum">
              {occ.budget_total ? `${occ.currency || "INR"} ${Number(occ.budget_total).toLocaleString()}` : "Budget flexible"}
            </span>

            <Link
              href={`/plan/${occ.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-roseDeep transition-colors"
            >
              <span>Open Plan</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PlansPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-rose">
            Your Celebrations
          </span>
          <h1 className="font-serif text-3xl font-bold text-plum sm:text-4xl">
            My Celebration Plans
          </h1>
          <p className="mt-1 text-sm text-mauve">
            Jump back into any of your planned celebrations or adapt schedules
          </p>
        </div>

        <Link
          href="/#intake"
          className="inline-flex items-center gap-2 rounded-full border border-rose/30 bg-white px-5 py-2.5 text-xs font-semibold text-rose hover:bg-blush transition-colors self-start sm:self-auto"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          <span>New celebration</span>
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="rounded-3xl border border-blush bg-white p-12 text-center text-sm text-mauve">
            Loading your celebration plans...
          </div>
        }
      >
        <PlansList />
      </Suspense>
    </main>
  );
}

