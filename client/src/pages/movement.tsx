import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, AlertTriangle, ArrowRight, Video, Camera } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/page-meta";
import { CAMERA_ACCURACY_SHORT } from "@shared/camera-accuracy-copy";
import { MOVEMENTS, movementBySlug } from "@shared/movement-library";

/** One page per validated movement, plus the index at /movements.
 *
 * FOUR PAGES, NOT FORTY. The version of this that writes itself is a page per exercise in the
 * whole library -- which would publish confident-looking tracking output for movements nobody
 * has checked. See shared/movement-library.ts. The list grows when the validation does.
 *
 * Every page leads with how to film the movement, because that is the part a coach can act on
 * today and the part that actually determines whether the numbers come out usable. The numbers
 * themselves still carry the disclosure.
 */
export function MovementIndexPage() {
  usePageMeta({
    title: "Movement library",
    description:
      "How to film each movement Forge's camera tracking has been validated on, what it measures, and what is not reliable on each one.",
    path: "/movements",
    image: "/marketing/shot-analytics.png",
  });

  return (
    <MarketingShell>
      <section className="px-4 pb-14 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Video className="h-3.5 w-3.5" />
            Movement library
          </span>
          <h1 className="mt-6 font-display text-4xl font-extrabold uppercase leading-tight tracking-wide md:text-5xl">
            How to film it, and what comes back
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            These are the movements Forge's camera tracking has been checked against real lifts.
            Each page covers where to put the phone, what gets measured, and what is not reliable
            on that particular movement.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            There are four, because four have been validated. We are not publishing a page for
            every exercise in the library and calling the output coaching.{" "}
            <Link href="/camera-validation" className="text-primary hover:underline">
              See the full validation list
            </Link>
            .
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {MOVEMENTS.map((m) => (
              <Link key={m.slug} href={`/movements/${m.slug}`}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="p-6">
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {m.mode}
                    </span>
                    <h2 className="mt-2 font-display text-xl font-bold">{m.name}</h2>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.filming}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

export default function MovementPage() {
  const { slug } = useParams<{ slug: string }>();
  const movement = movementBySlug(slug);

  usePageMeta({
    title: movement ? `Filming a ${movement.name.toLowerCase()}` : "Movement",
    description: movement
      ? `Where to put the camera for a ${movement.name.toLowerCase()}, what Forge measures from the footage, and what is not reliable on this movement.`
      : "A movement in Forge's camera tracking library.",
    path: `/movements/${slug}`,
    image: "/marketing/shot-analytics.png",
    // A slug that matches nothing is a dead URL, not a page worth indexing.
    noindex: !movement,
  });

  if (!movement) {
    return (
      <MarketingShell>
        <section className="px-4 py-24 md:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide">
              No movement with that name
            </h1>
            <p className="mt-4 text-muted-foreground">
              Forge's camera tracking has been validated on four movements so far.
            </p>
            <Link href="/movements">
              <Button className="mt-6">See all four</Button>
            </Link>
          </div>
        </section>
      </MarketingShell>
    );
  }

  return (
    <MarketingShell>
      <section className="px-4 pb-12 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-3xl">
          <Link href="/movements" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Movement library
          </Link>
          <span className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Check className="h-3.5 w-3.5" />
            Validated against real lifts
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold uppercase leading-tight tracking-wide md:text-5xl">
            Filming a {movement.name.toLowerCase()}
          </h1>
          <p className="mt-3 text-sm uppercase tracking-wide text-muted-foreground">
            {movement.mode} tracking
          </p>
        </div>
      </section>

      <section className="border-t border-border px-4 py-12 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-3">
            <Camera className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
                Where to put the phone
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">{movement.filming}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-12 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            What comes back
          </h2>
          <ul className="mt-5 space-y-3">
            {movement.measures.map((m) => (
              <li key={m} className="flex gap-3 text-muted-foreground">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border px-4 py-12 md:px-8">
        <div className="mx-auto max-w-3xl space-y-5">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            What is not reliable here
          </h2>
          <p className="text-muted-foreground">{movement.caveat}</p>

          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex gap-3 p-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-foreground">
                  And the general caveat, which applies to all four.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{CAMERA_ACCURACY_SHORT}</p>
                <Link href="/camera-validation">
                  <Button variant="outline" size="sm" className="mt-4">
                    What has been tested <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3 pt-2">
            {MOVEMENTS.filter((m) => m.slug !== movement.slug).map((m) => (
              <Link key={m.slug} href={`/movements/${m.slug}`}>
                <Button variant="outline" size="sm">{m.name}</Button>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
