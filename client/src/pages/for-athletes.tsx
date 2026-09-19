import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell, LineChart, Trophy, Apple, ArrowRight, AlertTriangle, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/page-meta";
import { CAMERA_ACCURACY_SHORT } from "@shared/camera-accuracy-copy";

/** THE ATHLETE PAGE.
 *
 * A different reader from the schools page and a different question. A coach or an AD is asking
 * whether this is safe and defensible to put in front of a roster of minors; an athlete is
 * asking whether it is worth opening at 6am before lifting.
 *
 * Written around the athlete's own record rather than around AI, because the record is what is
 * finished and trustworthy today. Same rule as every other page: no claim about camera accuracy
 * that the app itself contradicts, and the disclosure sits on the page rather than under it.
 */
export default function ForAthletesPage() {
  usePageMeta({
    title: "Forge for athletes",
    description:
      "Your programming, your lift history and your own record of every session -- on the phone you already train with.",
    path: "/for-athletes",
    image: "/marketing/shot-trophies.png",
  });

  return (
    <MarketingShell>
      <section className="px-4 pb-14 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Dumbbell className="h-3.5 w-3.5" />
            For athletes
          </span>
          <h1 className="mt-6 font-display text-4xl font-extrabold uppercase leading-tight tracking-wide md:text-5xl">
            Today's session, and everything you have already done
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Open it in the weight room and your programming is there -- sets, reps, the weight you
            hit last time. Log as you go. It keeps working when the gym wifi does not, and syncs
            the moment you have signal again.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button>
                Create an account <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline">See pricing</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <Dumbbell className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">Your session, already loaded</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  What your coach programmed, with last time's numbers next to each lift so you
                  are not scrolling back through a notebook between sets. A rest timer, a plate
                  calculator, and somewhere to say how the set actually felt.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <LineChart className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">A history that is yours</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Every session you have logged, every lift's progression, and your personal
                  records tracked without you having to maintain them. It follows you between
                  teams -- the record belongs to your account, not to whoever is coaching you this
                  season.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <Trophy className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">Something to chase</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Streaks, personal records and team challenges, built off sessions you actually
                  logged rather than participation. If you want none of it, it stays out of the
                  way.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <Apple className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">Fuelling, without the lecture</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Log food by barcode or by photo. Guidance for athletes comes from published
                  standards for your age and sport -- not from averaging what other people on the
                  app happened to eat, which mostly measures who is under-eating.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            Filming a set
          </h2>
          <p className="mt-4 text-muted-foreground">
            You can record a lift and send it to your coach for a form check. That part works and
            it is genuinely useful -- a coach who could not be there still sees the rep.
          </p>
          <Card className="mt-6 border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex gap-3 p-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-foreground">The numbers from it are not ready.</p>
                <p className="mt-2 text-sm text-muted-foreground">{CAMERA_ACCURACY_SHORT}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Do not change what you lift based on them yet. We would rather tell you that
                  than let you train off a number we do not trust.
                </p>
                <Link href="/camera-validation">
                  <Button variant="outline" size="sm" className="mt-4">
                    What has been tested <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
                If you are under 18
              </h2>
              <p className="mt-4 text-muted-foreground">
                A parent or guardian has to claim their own account before yours starts working.
                That is not a formality we can skip -- your account genuinely does not function
                until they do. They can switch camera tracking off for you and keep everything
                else, and either of you can delete the account whenever you want.
              </p>
              <Link href="/privacy">
                <Button variant="outline" size="sm" className="mt-5">
                  How your data is handled <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
