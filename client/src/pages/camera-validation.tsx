import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { SignupCta } from "@/components/signup-cta";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, AlertTriangle, ArrowRight, Camera } from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/page-meta";
import { CAMERA_ACCURACY_LONG } from "@shared/camera-accuracy-copy";
import { msg, useT } from "@/i18n";

/** THE PAGE THAT SAYS WHAT HAS ACTUALLY BEEN TESTED.
 *
 * Every other product in this category advertises camera-derived velocity and bar path with no
 * statement of what was measured against what. Forge is in the same position technically and in
 * a worse one commercially -- the metrics are uncalibrated and a paid tier was withdrawn from
 * sale over it. The choice was to say nothing until that changes, or to publish the state of it.
 *
 * This is the second option, and it is the only marketing page on the site that is fully true
 * today. It is drawn from docs/camera-tracking-notes.md, which is the engineering record; if
 * that file and this page disagree, the file is right and this page is stale.
 *
 * WHAT THIS PAGE MUST NEVER BECOME. The temptation, once calibration lands, will be to quietly
 * rewrite it into a capabilities page. The value here is entirely in it being the page that
 * admits things, and a coach who has read it once will notice. Update the table; keep the
 * admissions.
 */

type Movement = {
  name: string;
  mode: string;
  status: "validated" | "unvalidated";
  note?: string;
};

// Straight from docs/camera-tracking-notes.md, "What has actually been field-tested". Four, and
// the honest framing is that four is not many.
const MOVEMENTS: Movement[] = [
  { name: msg("Back squat"), mode: msg("Bar path"), status: "validated", note: msg("Filmed from behind") },
  { name: msg("Pendlay row"), mode: msg("Bar path"), status: "validated" },
  {
    name: msg("Bench press"),
    mode: msg("Bar path"),
    status: "validated",
    note: msg("The hardest case, calibration needs the full body in frame, and a lying athlete often is not"),
  },
  { name: msg("Box jump"), mode: msg("Jump"), status: "validated" },
  { name: msg("Deadlift"), mode: msg("Bar path"), status: "unvalidated", note: msg("Next in line") },
  { name: msg("Med ball throws"), mode: msg("Med ball"), status: "unvalidated", note: msg("Next in line") },
  { name: msg("Sprint"), mode: msg("Sprint"), status: "unvalidated" },
  { name: msg("Sled push / horizontal load"), mode: msg("Horizontal load"), status: "unvalidated" },
  { name: msg("Kettlebell swing"), mode: msg("KB swing"), status: "unvalidated" },
  { name: msg("Golf / baseball swing"), mode: msg("Rotation"), status: "unvalidated" },
  { name: msg("Running mechanics"), mode: msg("Mechanics"), status: "unvalidated" },
  {
    name: msg("Olympic lifts"),
    mode: msg("None yet"),
    status: "unvalidated",
    note: msg("Deliberately not offered, needs its own path model, see below"),
  },
];

export default function CameraValidationPage() {
  const t = useT();
  usePageMeta({
    title: "What the camera has actually been tested on",
    description:
      "Which movements Forge's camera tracking has been validated against real footage, which have not, and what a camera cannot measure from a given angle. Published in full.",
    path: "/camera-validation",
    image: "/marketing/shot-analytics.png",
  });

  const validated = MOVEMENTS.filter((m) => m.status === "validated");

  return (
    <MarketingShell>
      <section className="px-4 pb-16 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            <Camera className="h-3.5 w-3.5" />
            {t("Camera tracking")}
          </span>
          <h1 className="mt-6 font-display text-4xl font-extrabold uppercase leading-tight tracking-wide md:text-5xl">
            {t("What the camera has actually been tested on")}
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            {t("Forge films a set and derives numbers from it, bar speed, range of motion, jump height, bar path. Four movements have been checked against real lifts. The rest have not. This page says which is which, because a number you cannot audit is not worth training on.")}
          </p>

          {/* The same disclosure the app itself carries, from the same module, so the two cannot
              drift apart. This is the claim the page exists to make honestly. */}
          <Card className="mt-8 border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex gap-3 p-5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-foreground">{t("Right now, the numbers are not accurate.")}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t(CAMERA_ACCURACY_LONG)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            {t("Movement by movement")}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("{done} of {total} tracked movements have been validated against real footage.", {
              done: validated.length,
              total: MOVEMENTS.length,
            })}
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-semibold">{t("Movement")}</th>
                  <th className="py-3 pr-4 font-semibold">{t("Mode")}</th>
                  <th className="py-3 font-semibold">{t("Tested on real lifts")}</th>
                </tr>
              </thead>
              <tbody>
                {MOVEMENTS.map((m) => (
                  <tr key={m.name} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-4 font-medium text-foreground">
                      {t(m.name)}
                      {m.note && (
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {t(m.note)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{t(m.mode)}</td>
                    <td className="py-3">
                      {m.status === "validated" ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-500">
                          <Check className="h-4 w-4" /> {t("Yes")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <X className="h-4 w-4" /> {t("Not yet")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-3xl space-y-10">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            {t("Three things a camera cannot do, whatever the software claims")}
          </h2>

          <div>
            <h3 className="font-display text-lg font-bold">{t("The angle decides which numbers exist")}</h3>
            <p className="mt-2 text-muted-foreground">
              {t("One camera sees two dimensions. Depth is estimated, and it is the least reliable number in the pipeline. Filming a squat from behind puts forward-and-back drift on exactly that estimated axis, so the reading most coaches want from that angle is the one the setup is worst at. Forge records the angle a set was filmed from and says so next to the number, rather than presenting all three axes as equals.")}
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold">
              {t("Olympic lifts need a different model, so we do not offer them")}
            </h3>
            <p className="mt-2 text-muted-foreground">
              {t("Bar path deviation measures departure from a straight vertical line, and peak velocity is computed on the vertical component alone. That is right for a squat, bench, row or deadlift, where sideways bar movement is error. A correct clean or snatch has a deliberate S-curve. Under a bar-path model, a technically perfect lift reports large deviation, a lift with no curve at all reports clean, and peak velocity understates the bar at exactly the moment that matters. Switching bar-path tracking on for Olympic lifts would produce confident, wrong numbers, so it is off.")}
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold">
              {t("Scale comes from the body, and bench is where that breaks")}
            </h3>
            <p className="mt-2 text-muted-foreground">
              {t("Turning pixels into centimetres needs a known real-world length in frame, and Forge calibrates from the athlete's own height. An athlete lying flat with their feet out of frame cannot produce that measurement. So on bench specifically, a wrong number is more likely to be a calibration failure than a tracking failure, and from outside, the two look identical. A capture that cannot trust its scale is saved with a record of why rather than quietly reported as a result.")}
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide">
            {t("What happens when a capture fails")}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {t("It is kept. A take the tracker could not read is not thrown away, the video is saved for the coach, the set is recorded with whatever could be counted, and the failure is stored with the reason. An empty result and a set nobody filmed are different things, and a system that cannot tell them apart cannot be debugged or improved.")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SignupCta>
              {t("Try Forge")} <ArrowRight className="ml-1.5 h-4 w-4" />
            </SignupCta>
            <Link href="/for-high-schools">
              <Button variant="outline">{t("For schools and clubs")}</Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
