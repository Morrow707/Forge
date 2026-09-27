import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ReadFailed } from "@/components/read-failed";
import { getJson, apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Play } from "lucide-react";

type Target = { kind: "exercise" | "skill"; id: number; name: string };

type Proposal = Target & {
  url: string;
  match: { videoId: string; title: string; channel: string; durationSeconds: number; precision: number };
};

type ChannelSummary = {
  channel: string;
  catalogueSize: number;
  status?: "ok" | "handle_not_found" | "error";
  matchesWon: number;
  medianWinningDurationSeconds: number | null;
};

type KindTally = { considered: number; matched: number };

type Report = {
  targetsConsidered: number;
  byKind: { exercise: KindTally; skill: KindTally };
  proposals: Proposal[];
  unmatched: Target[];
  channels: ChannelSummary[];
  quota: { units: number; calls: number };
  maxDurationSeconds: number;
  written?: number;
};

type Pending = {
  pending: number;
  configured: boolean;
  channels: string[];
  maxDurationSeconds: number;
  targets: Target[];
};

const mmss = (s: number | null) =>
  s == null ? "--" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * THE DEMO-VIDEO BACKFILL, WITH SOMEWHERE TO READ IT.
 *
 * Every seeded videoUrl in the library is a youtube.com/results search link, so nothing embeds and
 * the pill leaves the app. The backfill (server/exercise-video-backfill.ts) replaces those. This
 * page is where its report is read, and it exists because the routes shipped without one -- a
 * report nobody can open is the same as no report.
 *
 * THE DRY RUN IS THE POINT, NOT A SAFETY STEP. Its per-channel table is the evidence for keeping
 * or cutting a channel: match count and MEDIAN WINNING LENGTH. Scott's rule is shorts -- "we need
 * shorts, where it gets straight to the how to, not 18 minute videos of someone talking" -- and a
 * channel whose median winning clip runs two and a half minutes is not supplying shorts, whatever
 * anybody's impression of it. Squat University came out of the list on exactly that test.
 *
 * APPLY IS A SEPARATE RUN, NOT "WRITE WHAT YOU JUST SHOWED ME". It re-pulls and re-matches, and
 * re-checks per row that the URL is still a placeholder. A stored plan that wrote blind would
 * overwrite a URL an admin set in between, and that is indistinguishable from data loss.
 */
export default function AdminExerciseVideos() {
  const [report, setReport] = useState<Report | null>(null);
  const [mode, setMode] = useState<"dry-run" | "apply" | null>(null);
  const [cap, setCap] = useState("");

  const pending = useQuery<Pending>({
    queryKey: ["/api/admin/exercise-videos/pending"],
    queryFn: () => getJson("/api/admin/exercise-videos/pending"),
  });

  const run = useMutation({
    mutationFn: async (which: "dry-run" | "apply") => {
      setMode(which);
      const seconds = Number(cap);
      const body = Number.isFinite(seconds) && seconds >= 10 ? { maxDurationSeconds: seconds } : {};
      const res = await apiRequest("POST", `/api/admin/exercise-videos/${which}`, body);
      return (await res.json()) as Report;
    },
    onSuccess: (data, which) => {
      setReport(data);
      if (which === "apply") {
        pending.refetch();
        toast.success(
          `${data.written ?? 0} video${data.written === 1 ? "" : "s"} written -- ${data.unmatched.length} left on a search link`,
        );
      }
    },
    onError: (err: unknown) => {
      // The 503 for a missing key says so in its own words; anything else is shown as-is rather
      // than flattened into "something went wrong", because the reason is the useful part.
      toast.error(err instanceof Error ? err.message : "The run did not finish.");
    },
    onSettled: () => setMode(null),
  });

  const busy = run.isPending;

  return (
    <AppShell title="Demo Videos">
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div>
          <h1 className="text-2xl font-bold">Demo videos</h1>
          <p className="text-sm text-muted-foreground">
            Every seeded exercise carries a YouTube <em>search link</em>, not a video, so nothing
            plays inside Forge. This replaces those with real clips -- shortest match wins, and a
            URL anybody chose by hand is never touched.
          </p>
        </div>

        {pending.isError ? (
          <ReadFailed what="the demo-video status" onRetry={() => pending.refetch()} error={pending.error} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Where it stands</CardTitle>
              <CardDescription>
                This read spends no YouTube quota at all, so it is safe to refresh.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {pending.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <p>
                    <span className="text-2xl font-bold tabular-nums">{pending.data?.pending ?? 0}</span>{" "}
                    exercises and skill drills still on a search link.
                  </p>
                  {pending.data?.configured === false && (
                    <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <strong>YOUTUBE_API_KEY is not set on this server.</strong> No catalogue can
                        be read until it is, in Render's environment. That is an operator setting,
                        not a fault in the app.
                      </span>
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    Channels: {pending.data?.channels.join(", ")}. Cap{" "}
                    {mmss(pending.data?.maxDurationSeconds ?? 0)} by default -- most winners come in
                    well under it, because a Short beats a breakdown of the same lift.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run it</CardTitle>
            <CardDescription>
              Read the dry run's channel table before applying anything. A channel whose median
              winning clip runs long is not supplying shorts and should come out of the list.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="cap">
                Length cap, seconds (blank = {pending.data?.maxDurationSeconds ?? 180})
              </label>
              <Input
                id="cap"
                className="w-40"
                inputMode="numeric"
                placeholder={String(pending.data?.maxDurationSeconds ?? 180)}
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
            </div>
            <Button onClick={() => run.mutate("dry-run")} disabled={busy}>
              {busy && mode === "dry-run" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Dry run
            </Button>
            <Button variant="secondary" onClick={() => run.mutate("apply")} disabled={busy}>
              {busy && mode === "apply" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply
            </Button>
            {busy && (
              <span className="text-xs text-muted-foreground">
                Pulling channel catalogues -- a full run takes a minute or two.
              </span>
            )}
          </CardContent>
        </Card>

        {report && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {report.written == null ? "Dry run" : `Applied -- ${report.written} written`}
                </CardTitle>
                <CardDescription>
                  {/* Lifts and drills are counted apart on purpose: the sport drills are niche
                      enough that no strength channel carries them, so folding them in buries how
                      well the lift library -- the part any decision rests on -- is covered. */}
                  <strong>
                    Lifts: {report.byKind?.exercise.matched ?? 0} of{" "}
                    {report.byKind?.exercise.considered ?? 0}
                  </strong>
                  . Skill drills: {report.byKind?.skill.matched ?? 0} of{" "}
                  {report.byKind?.skill.considered ?? 0} -- these are niche enough that no
                  strength channel carries them, and a search link is the expected outcome.
                  <br />
                  Cap {mmss(report.maxDurationSeconds)}. {report.quota.units} quota units over{" "}
                  {report.quota.calls} calls, out of 10,000 free a day.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Channel</th>
                      <th className="py-1 pr-3 text-right">Catalogue</th>
                      <th className="py-1 pr-3 text-right">Matches won</th>
                      <th className="py-1 text-right">Median length</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.channels.map((c) => (
                      <tr key={c.channel} className="border-t border-border">
                        <td className="py-1 pr-3">
                          {c.channel}
                          {/* A bare 0 read as "their videos are too long" for two runs, when in
                              fact the channel never loaded and the cap never saw a single video.
                              Opposite problems, opposite fixes. */}
                          {c.status === "handle_not_found" && (
                            <span className="ml-2 text-xs text-destructive">
                              handle did not resolve -- needs a UC... channel ID, not a verdict on
                              the channel
                            </span>
                          )}
                          {c.status === "error" && (
                            <span className="ml-2 text-xs text-destructive">
                              API error (most likely quota) -- nothing was read
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">{c.catalogueSize}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{c.matchesWon}</td>
                        <td className="py-1 text-right tabular-nums">
                          {mmss(c.medianWinningDurationSeconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  A channel with a catalogue but few matches is a content verdict -- it is not
                  making short demonstrations. A catalogue of 0 is not: nothing was ever read, so
                  the length cap never saw it.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Matches</CardTitle>
                <CardDescription>
                  Open a few before applying. A wrong lift shown with the confidence of a chosen
                  video is worse than the search box it replaced.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {report.proposals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing matched.</p>
                ) : (
                  report.proposals.map((p) => (
                    <div
                      key={`${p.kind}-${p.id}`}
                      className="flex flex-wrap items-center gap-2 border-b border-border pb-1.5 text-sm last:border-0"
                    >
                      <Badge variant="outline" className="shrink-0">
                        {p.kind === "skill" ? "Drill" : "Lift"}
                      </Badge>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">&rarr;</span>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        {p.match.title}
                      </a>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                        {p.match.channel} &middot; {mmss(p.match.durationSeconds)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  No match -- {report.unmatched.length} keep their search link
                </CardTitle>
                <CardDescription>
                  Deliberate. These stay on the search box rather than getting a loose match, and
                  the pill still works. Adding a channel that covers them is the fix.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {report.unmatched.map((t) => t.name).join(", ") || "None."}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
