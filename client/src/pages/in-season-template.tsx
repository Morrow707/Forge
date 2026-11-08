import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ClipboardList, Download, Mail } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MarketingShell } from "@/components/marketing-shell";
import { usePageMeta } from "@/lib/page-meta";

const PDF = "/downloads/in-season-2-day-lift.pdf";
const PREVIEW = "/downloads/in-season-2-day-lift.png"; // the share card: scrapers cannot read webp
const PREVIEW_WEBP = "/downloads/in-season-2-day-lift.webp"; // what the page itself loads

/** THE FREE IN-SEASON TEMPLATE.
 *
 * Where the Instagram bio link lands (Scott, 2026-11-08, from the social media review: the bio
 * said "join the launch list below" and the link opened a page whose launch list form sat in the
 * footer). A coach leaves an email, joins the launch list with source "template", and gets the
 * printable. Same email-list route and rules as EmailListSignup: the answer never says whether
 * the address was already there, so the download shows either way.
 *
 * The PDF is drawn by the Instagram bot (forge-instagram, forge/leadmagnet.py) and copied into
 * client/public/downloads. A starting point a coach adjusts, never a prescription.
 */
export default function InSeasonTemplatePage() {
  usePageMeta({
    title: "Free 2-day in-season lift for high school teams",
    description:
      "A printable two-day in-season lifting template for high school teams: jumps, a squat, a hinge, upper push and pull, and the rules that keep legs fresh for game day.",
    path: "/in-season-template",
    image: PREVIEW,
  });

  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/public/email-list", { email, source: "template" });
    },
    onSuccess: () => setJoined(true),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    mutation.mutate();
  };

  return (
    <MarketingShell>
      <section className="px-4 pb-14 pt-14 md:px-8 md:pt-20">
        <div className="mx-auto grid max-w-5xl items-start gap-10 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <ClipboardList className="h-3.5 w-3.5" />
              Free for coaches
            </span>
            <h1 className="mt-6 font-display text-4xl font-extrabold uppercase leading-tight tracking-wide md:text-5xl">
              A 2-day in-season lift you can run this week
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Two sessions a week, about 45 minutes, built around games. Jumps, a squat and a hinge,
              upper push and pull, and the rules that keep legs fresh for game day. One printable
              page for the weight room wall.
            </p>

            <div className="mt-8">
              {joined ? (
                <div role="status" className="space-y-3">
                  <p className="font-semibold">You're on the list. Here's your template.</p>
                  <a href={PDF} download>
                    <Button>
                      <Download className="mr-1.5 h-4 w-4" />
                      Download the PDF
                    </Button>
                  </a>
                  <p className="text-sm text-muted-foreground">
                    Print it, put it up, and adjust it for your athletes.
                  </p>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Leave your email and the PDF is yours. You'll also be on the Forge launch list,
                    so you hear when the app opens.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="coach@school.org"
                      aria-label="Email address for the template and launch updates"
                    />
                    <Button type="submit" disabled={mutation.isPending || !email.trim()}>
                      <Mail className="mr-1.5 h-4 w-4" />
                      {mutation.isPending ? "Sending…" : "Send it to me"}
                    </Button>
                  </div>
                  {mutation.isError && (
                    <p className="text-sm text-destructive">
                      {mutation.error instanceof ApiError ? mutation.error.message : "That didn't go through. Try again."}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Launch news only. Every email has an unsubscribe link.
                  </p>
                </form>
              )}
            </div>
          </div>

          <img
            src={PREVIEW_WEBP}
            alt="The 2-day in-season lift: Day A and Day B with sets and reps, and five rules for the season"
            width={1275}
            height={1650}
            loading="lazy"
            className="w-full rounded-lg border border-border shadow-sm"
          />
        </div>
      </section>

      <section className="border-t border-border px-4 py-14 md:px-8">
        <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <h2 className="font-display text-xl font-bold uppercase tracking-wide">Day A</h2>
              <p className="mt-3 text-muted-foreground">
                Early in the week, two or more days before the next game. A jump, a squat, a hinge,
                single-leg work, a press and a pull.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h2 className="font-display text-xl font-bold uppercase tracking-wide">Day B</h2>
              <p className="mt-3 text-muted-foreground">
                Midweek, never the day before a game. A jump, a trap bar pull, a press, a row,
                lateral work and carries.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h2 className="font-display text-xl font-bold uppercase tracking-wide">The rules</h2>
              <p className="mt-3 text-muted-foreground">
                Leave reps in the tank, cut volume and keep the weight, no new lifts once games
                start. A starting point, not a prescription: adjust it for your athletes.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </MarketingShell>
  );
}
