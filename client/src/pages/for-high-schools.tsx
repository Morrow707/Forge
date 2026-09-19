import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, Users, FileCheck, Lock, ArrowRight, AlertTriangle, School } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/page-meta";
import { CAMERA_ACCURACY_SHORT } from "@shared/camera-accuracy-copy";

/** THE SCHOOLS AND CLUBS PAGE.
 *
 * Positioned on the privacy architecture rather than on features, because that is where Forge is
 * genuinely ahead and because it is what an athletic director is actually accountable for. The
 * camera pipeline is the exciting part and the part that is not ready; the consent model is
 * unglamorous and real.
 *
 * TWO CLAIMS THIS PAGE MUST NOT MAKE, both of which are easy to drift into:
 *
 * 1. "COPPA compliant." Whether a guardian clicking an emailed link is VERIFIABLE consent under
 *    COPPA is an open question with counsel (docs/legal-open-questions.md, question 5). What can
 *    be said is what the product does: an under-18 account does not function until a guardian
 *    claims it. That is a description, not a legal conclusion, and it is the stronger claim
 *    anyway because it is checkable.
 *
 * 2. Anything about camera accuracy. See CAMERA_ACCURACY_SHORT, carried below.
 */
export default function ForHighSchoolsPage() {
  usePageMeta({
    title: "Forge for high schools and clubs",
    description:
      "Roster management, guardian consent for athletes under 18, and a privacy model built for minors from the start rather than bolted on.",
    path: "/for-high-schools",
    image: "/marketing/shot-program-builder.png",
  });

  return (
    <MarketingShell>
      <section className="px-4 pb-14 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <School className="h-3.5 w-3.5" />
            For schools and clubs
          </span>
          <h1 className="mt-6 font-display text-4xl font-extrabold uppercase leading-tight tracking-wide md:text-5xl">
            Built for rosters of minors, from the first line of code
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Most training software is built for adults and has consent bolted on afterwards. If
            your roster is fourteen-year-olds, that difference is yours to answer for. Forge
            treats an athlete's age as the thing that decides what the platform may do, not as a
            field on a form.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button>
                Get started <ArrowRight className="ml-1.5 h-4 w-4" />
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
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            What that actually means
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Card>
              <CardContent className="p-6">
                <Lock className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">
                  An under-18 account does not work until a guardian claims it
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Not a checkbox the athlete ticks, and not a warning a coach can click past. The
                  athlete signs in to a screen telling them to wait. A parent or legal guardian
                  claims their own linked account, and the moment they do, Forge records what they
                  agreed to and the exact text they were shown.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">
                  Three age tiers, with different rules
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Under 13, 13 to 17, and adult are separate tiers with separate handling, because
                  the obligations genuinely differ. An under-13 gets the strictest treatment
                  automatically, on their date of birth, with no one having to remember.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <FileCheck className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">
                  Consent is a dated record, not a flag
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Every agreement stores the document text as it stood at the moment it was
                  accepted. If a policy changes later, what someone actually agreed to is still
                  retrievable, and they are asked again rather than being silently moved onto new
                  terms. Withdrawal writes its own dated record.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <Users className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-lg font-bold">
                  Coaches see their athletes. Nobody else does.
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  A coach sees their own roster by name, because that is what coaching is. Every
                  platform-wide screen on the operator side shows group numbers with the names
                  removed and a per-report code that maps back to nobody. Small groups are
                  suppressed rather than shown.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            Questions an athletic director should ask any vendor
          </h2>

          <div>
            <h3 className="font-display text-lg font-bold">Where does the data physically live?</h3>
            <p className="mt-2 text-muted-foreground">
              One provider, in the United States: the database and every uploaded video and
              document. Payment details go to Stripe and never touch Forge's servers. Our AI
              features send the text of a request to the model at the moment it is asked and it is
              not stored there.
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold">What happens to video?</h3>
            <p className="mt-2 text-muted-foreground">
              Form-check clips are kept to a per-athlete limit and then aged out. When a video is
              removed, the measurements taken from it survive -- an athlete does not lose their
              training history because a file was cleaned up.
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold">Can a parent get their child out?</h3>
            <p className="mt-2 text-muted-foreground">
              Yes, and in two separate ways, because they are separate questions. Camera
              collection can be switched off for an athlete at a guardian's request while they
              keep using everything else. Account deletion is its own action and removes the
              account outright.
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold">Is this a student record?</h3>
            <p className="mt-2 text-muted-foreground">
              Forge receives a name, age, gender, sport and position. No grades, no transcripts,
              nothing from a student information system. If your district's procurement needs an
              addendum, send it to us.
            </p>
          </div>
        </div>
      </section>

      {/* Placed before the call to action rather than in a footnote. A school buying on the
          strength of camera tracking is the one buyer most likely to be disappointed right now,
          and finding this out after signing is worse for everyone than reading it here. */}
      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-3xl">
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex gap-3 p-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-foreground">
                  If you are buying this for the camera tracking, read this first.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{CAMERA_ACCURACY_SHORT}</p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Four movements have been validated against real lifts. We publish the full list,
                  including what has not been tested.
                </p>
                <Link href="/camera-validation">
                  <Button variant="outline" size="sm" className="mt-4">
                    See what has been tested <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </MarketingShell>
  );
}
