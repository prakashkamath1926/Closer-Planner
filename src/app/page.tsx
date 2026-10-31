import { BotanicalSprig } from "@/components/botanical";
import { Reveal } from "@/components/reveal";
import { StatusTag } from "@/components/status-tag";
import { Button } from "@/components/ui/button";
import { IntakeFlow } from "@/components/intake/intake-flow";

const steps = [
  {
    title: "Tell us about them",
    body: "Share who it is for and what you hope they will feel. We ask only the few questions that change the plan.",
  },
  {
    title: "Choose what feels right",
    body: "See a small set of ideas with a short reason each might suit them. Edit, combine, or reject anything.",
  },
  {
    title: "Plan, adapt, and keep the secret",
    body: "Budget, timeline, and vendors stay in one place. When things change, the plan changes with you.",
  },
];

export default function Home() {
  return (
    <>
      <section className="relative mx-auto grid w-full max-w-6xl min-h-[calc(100svh-4rem)] items-center gap-8 px-4 py-8 sm:px-6 md:grid-cols-[1.4fr_1fr] md:gap-12 md:py-12">
        <Reveal>
          <p className="font-hand text-2xl text-rose-deep">A little something just for them</p>
          <h1 className="mt-2 text-4xl sm:text-5xl">
            Make them feel loved, understood, and special.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Thoughtful celebrations, made personal. Tell us who it is for and how much time you
            have. We help you plan it, adapt when things change, and keep you in control.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <a href="#intake">Start planning</a>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto w-full max-w-xs">
          <div className="rotate-2 rounded-3xl bg-blush p-6 shadow-paper">
            <BotanicalSprig />
          </div>
        </Reveal>
      </section>

      <section
        id="intake"
        className="relative w-full scroll-mt-16 bg-gradient-to-b from-paper via-blush/20 to-blush/30 pt-10 pb-12 border-b border-blush/40"
      >
        <IntakeFlow />
      </section>

      <section
        id="how-it-works"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6"
      >
        <h2 className="text-3xl">How it works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-3xl bg-card p-6 shadow-paper">
              <span className="grid size-10 place-items-center rounded-full bg-rose font-heading text-lg text-primary-foreground">
                {index + 1}
              </span>
              <h3 className="mt-4 text-xl">{step.title}</h3>
              <p className="mt-2 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="honest-by-design"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6"
      >
        <div className="rounded-3xl bg-blush p-6 sm:p-10">
          <h2 className="text-3xl">Honest by design</h2>
          <p className="mt-3 max-w-2xl text-plum">
            We never present a guess as a fact. Everything we suggest carries a label, so you
            always know what to double-check.
          </p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            <li className="flex flex-col items-start gap-2 rounded-2xl bg-card p-4">
              <StatusTag status="known" />
              <p className="text-plum">Something you told us.</p>
            </li>
            <li className="flex flex-col items-start gap-2 rounded-2xl bg-card p-4">
              <StatusTag status="possible" />
              <p className="text-plum">An idea that might suit them. You decide.</p>
            </li>
            <li className="flex flex-col items-start gap-2 rounded-2xl bg-card p-4">
              <StatusTag status="needs_confirmation" />
              <p className="text-plum">Worth checking before you rely on it.</p>
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
