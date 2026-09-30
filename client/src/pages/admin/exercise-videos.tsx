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
import { AlertTriangle, Check, Copy, Loader2, Play } from "lucide-react";

type Target = { kind: "exercise" | "skill"; id: number; name: string };

type RejectReason =
  | "red-flag"
  | "no-head"
  | "combo"
  | "head"
  | "modifier"
  | "equipment"
  | "muscle-unexplained"
  | "unknown-count"
  | "duration";

type Rejection = {
  reason: RejectReason;
  detail: string;
  title?: string;
  channel?: string;
  durationSeconds?: number;
};

type Unmatched = Target & { rejection?: Rejection };

type Proposal = Target & {
  url: string;
  match: {
    videoId: string;
    title: string;
    channel: string;
    durationSeconds: number;
    tier: "A" | "B";
    corroboration: "single" | "multi";
  };
};

type ChannelSummary = {
  channel: string;
  catalogueSize: number;
  truncated?: boolean;
  status?: "ok" | "handle_not_found" | "error";
  matchesWon: number;
  medianWinningDurationSeconds: number | null;
};

type KindTally = { considered: number; matched: number };

type Report = {
  targetsConsidered: number;
  byKind: { exercise: KindTally; skill: KindTally };
  proposals: Proposal[];
  unmatched: Unmatched[];
  channels: ChannelSummary[];
  quota: { units: number; calls: number };
  maxDurationSeconds: number;
  tierCounts: { A: number; B: number };
  searchFill?: { searched: number; filled: number; stillEmpty: number; remaining: number };
  unknownWords: Array<{ word: string; count: number; examples: string[] }>;
  duplicateSignatures: Array<[string, string]>;
  boilerplateByChannel: Record<string, string[]>;
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
/** Scott, 2026-09-28: "give me an easy copy and paste button on all fields too so i can stop
 *  taking photos of everything." Every card copies itself as plain text, and the run header
 *  copies the whole report. Text, not JSON: it is pasted into a chat, not a program. */
function CopyButton({ text, label = "Copy" }: { text: () => string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Could not copy -- the browser refused clipboard access.");
        }
      }}
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : label}
    </Button>
  );
}

const REJECTION_GROUPS: Array<{ key: RejectReason; title: string; blurb: string }> = [
  {
    key: "head",
    title: "Different movement",
    blurb:
      "The title's movement word is not this exercise's. \"Squat Box Jump\" is a jump, so Box Squat cannot have it. Nothing to tune -- these were never candidates.",
  },
  {
    key: "combo",
    title: "A complex or a sequence",
    blurb:
      "The title names this lift and then goes on to another. \"Back Squat - Jerk Behind the Neck\" is a complex, and it auto-applied to Back Squat before this rule existed.",
  },
  {
    key: "modifier",
    title: "A word that changes the variation",
    blurb:
      "Same movement, different version: the title adds or drops a modifier. \"Barbell Wrist Curl\" against Barbell Curl. Correct refusals -- unless Forge is missing that variation as its own exercise.",
  },
  {
    key: "equipment",
    title: "Different equipment",
    blurb:
      "A kettlebell sumo deadlift is not a barbell one. Worth reading: our equipment column defaults to Barbell, so an exercise that never had it set can refuse a correct video here.",
  },
  {
    key: "muscle-unexplained",
    title: "Names a muscle this exercise does not train",
    blurb:
      "The title says a muscle that is not in this exercise's metadata -- usually a sign it is a different movement, occasionally a sign our metadata is thin.",
  },
  {
    key: "unknown-count",
    title: "A word the library has never seen",
    blurb:
      "The strictest rule and the most productive one. An unrecognised word in the name is either a variation we have no word for or one that changes the movement. The words themselves are listed below -- that list is what to fix.",
  },
  {
    key: "red-flag",
    title: "Not a demonstration",
    blurb:
      "A weight in the title, an emoji, shouting, a hashtag in the name, or a word like underrated or hack. \"Alyssa Back Squat 127 kg\" parses perfectly and is somebody's competition single.",
  },
  {
    key: "duration",
    title: "Would have matched, too long",
    blurb:
      "A clean match refused only for length. The one group a higher cap buys back, and the only place raising it helps.",
  },
  {
    key: "no-head",
    title: "No movement word at all",
    blurb:
      "Either the title names nothing we recognise, or this exercise's own name has no head word -- worth checking the name itself if a common lift lands here.",
  },
];

const rejectionLine = (t: Unmatched) =>
  [t.name, t.rejection?.title ? `-> ${t.rejection.title}` : "", t.rejection?.detail ? `(${t.rejection.detail})` : ""]
    .filter(Boolean)
    .join(" ");

function summaryText(report: Report): string {
  const lines = [
    report.written == null ? "DRY RUN" : `APPLIED -- ${report.written} written`,
    `Lifts: ${report.byKind?.exercise.matched ?? 0} of ${report.byKind?.exercise.considered ?? 0}. Skill drills: ${report.byKind?.skill.matched ?? 0} of ${report.byKind?.skill.considered ?? 0}.`,
    `Tier A ${report.tierCounts?.A ?? 0}, Tier B ${report.tierCounts?.B ?? 0}. Cap ${mmss(report.maxDurationSeconds)}. ${report.quota.units} quota units over ${report.quota.calls} calls.`,
    "",
    "CHANNEL | CATALOGUE | MATCHES WON | MEDIAN LENGTH",
    ...report.channels.map(
      (c) =>
        `${c.channel} | ${c.catalogueSize}${c.truncated ? "+ (capped)" : ""}${c.status === "handle_not_found" ? " (handle did not resolve)" : ""}${c.status === "error" ? " (API error)" : ""} | ${c.matchesWon} | ${mmss(c.medianWinningDurationSeconds)}`,
    ),
  ];
  return lines.join("\n");
}

function matchesText(report: Report): string {
  return [
    "MATCHES",
    ...report.proposals.map(
      (p) => `${p.match.tier} | ${p.name} -> ${p.match.title} | ${p.match.channel} | ${mmss(p.match.durationSeconds)} | ${p.url}`,
    ),
  ].join("\n");
}

function unknownWordsText(report: Report): string {
  return [
    "WORDS THE LIBRARY HAS NEVER SEEN",
    ...(report.unknownWords ?? []).map((w) => `${w.word} x${w.count}  ${w.examples[0] ?? ""}`),
  ].join("\n");
}

function duplicatesText(report: Report): string {
  return [
    "LIBRARY NAMES THAT MEAN THE SAME THING",
    ...(report.duplicateSignatures ?? []).map(([a, b]) => `${a} = ${b}`),
  ].join("\n");
}

function noMatchText(unmatched: Unmatched[]): string {
  const lifts = unmatched.filter((t) => t.kind === "exercise");
  const out = [`NO MATCH -- ${unmatched.length} keep their search link (${lifts.length} lifts)`];
  for (const group of REJECTION_GROUPS) {
    const rows = lifts.filter((t) => t.rejection?.reason === group.key);
    if (rows.length === 0) continue;
    out.push("", `${group.title} -- ${rows.length}`, ...rows.map(rejectionLine));
  }
  return out.join("\n");
}

function wholeReportText(report: Report): string {
  return [
    summaryText(report),
    "",
    matchesText(report),
    "",
    unknownWordsText(report),
    "",
    duplicatesText(report),
    "",
    noMatchText(report.unmatched),
  ].join("\n");
}

export default function AdminExerciseVideos() {
  const [report, setReport] = useState<Report | null>(null);
  const [mode, setMode] = useState<"dry-run" | "apply" | null>(null);
  const [cap, setCap] = useState("");
  const [searchUnmatched, setSearchUnmatched] = useState(false);

  const pending = useQuery<Pending>({
    queryKey: ["/api/admin/exercise-videos/pending"],
    queryFn: () => getJson("/api/admin/exercise-videos/pending"),
  });

  const run = useMutation({
    mutationFn: async (which: "dry-run" | "apply") => {
      setMode(which);
      const seconds = Number(cap);
      const body: Record<string, unknown> =
        Number.isFinite(seconds) && seconds >= 10 ? { maxDurationSeconds: seconds } : {};
      // Opt-in, because it is the only expensive path here -- see the checkbox's own copy.
      if (searchUnmatched) body.searchUnmatched = true;
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
            <label className="flex max-w-md items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={searchUnmatched}
                onChange={(e) => setSearchUnmatched(e.target.checked)}
              />
              <span>
                <strong className="text-foreground">Search YouTube for the ones no channel has.</strong>{" "}
                The long tail -- stretches, mobility, odd equipment -- is missing because no
                channel in the pool films it at all, not because it was refused. This searches for
                each one and takes the most watched result that still passes every rule. Costs 100
                quota units per exercise against 10,000 a day, so a run covers about 90 and says
                how many are left; run it again tomorrow to continue. Every result is Tier B.
              </span>
            </label>
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
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <span>{report.written == null ? "Dry run" : `Applied -- ${report.written} written`}</span>
                  <span className="ml-auto flex gap-1">
                    <CopyButton text={() => summaryText(report)} label="Copy summary" />
                    <CopyButton text={() => wholeReportText(report)} label="Copy whole report" />
                  </span>
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
                  <br />
                  <strong>Tier A {report.tierCounts?.A ?? 0}</strong> -- applied without review:
                  nothing unrecognised in the title, equipment stated rather than assumed, under
                  two minutes, from a channel you have watched.{" "}
                  <strong>Tier B {report.tierCounts?.B ?? 0}</strong> -- a match nothing is wrong
                  with that nobody has confirmed. Apply writes tier A only.
                  <br />
                  {report.searchFill && (
                    <>
                      <br />
                      <strong>Searched {report.searchFill.searched}</strong> exercises no channel
                      had: {report.searchFill.filled} filled, {report.searchFill.stillEmpty} found
                      nothing that passed,{" "}
                      {report.searchFill.remaining > 0
                        ? `${report.searchFill.remaining} still waiting -- run again to continue.`
                        : "none left waiting."}
                    </>
                  )}
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
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {c.catalogueSize}
                          {c.truncated && (
                            <span className="ml-1 text-xs text-destructive" title="The read stopped at the ceiling; the oldest uploads were not seen.">
                              + (capped)
                            </span>
                          )}
                        </td>
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
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>Matches</span>
                  <span className="ml-auto"><CopyButton text={() => matchesText(report)} /></span>
                </CardTitle>
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
                      <Badge
                        variant={p.match.tier === "A" ? "default" : "outline"}
                        className="shrink-0"
                      >
                        {p.match.tier === "A" ? "A" : "B -- review"}
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

            {(report.unknownWords?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span>Words the library has never seen</span>
                    <span className="ml-auto"><CopyButton text={() => unknownWordsText(report)} /></span>
                  </CardTitle>
                  <CardDescription>
                    Each of these cost at least one match. Read them as a to-do list: a word that
                    never changes a movement ("beginners", "gym") belongs in the filler table; a
                    word that names a real variation ("scap", "anti", "tempo") belongs in the
                    library as its own exercise, or in the modifier list. Both are code changes --
                    the vocabulary stays in the repo under test rather than editable here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  {report.unknownWords.slice(0, 30).map((w) => (
                    <div key={w.word} className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span className="font-mono font-semibold">{w.word}</span>
                      <span className="tabular-nums text-muted-foreground">x{w.count}</span>
                      <span className="text-muted-foreground">{w.examples[0]}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {(report.duplicateSignatures?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span>Library names that mean the same thing -- {report.duplicateSignatures.length}</span>
                    <span className="ml-auto"><CopyButton text={() => duplicatesText(report)} /></span>
                  </CardTitle>
                  <CardDescription>
                    These pairs parse identically, so no video can tell them apart. That is a
                    library problem rather than a matching one: either they are duplicates worth
                    merging, or one needs a word that says how it differs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-0.5">
                  {report.duplicateSignatures.slice(0, 25).map(([a, b]) => (
                    <p key={`${a}|${b}`} className="text-xs">
                      {a} <span className="text-muted-foreground">=</span> {b}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}

            <NoMatchCard unmatched={report.unmatched} />
          </>
        )}
      </div>
    </AppShell>
  );
}


/** WHY EACH ONE GOT NOTHING, GROUPED BY THE RULE THAT TURNED IT AWAY.
 *
 * This was a comma-separated wall of 264 names, which said only THAT they failed. Each reason
 * below wants a different response -- relax the floor, raise the cap, add a channel, or nothing
 * at all -- so a list that cannot distinguish them leaves every decision to guesswork. That is
 * how "Westside's videos must be too long" happened for a channel that was never read.
 *
 * Lifts first and separately: a sport drill going unmatched is the expected outcome and not
 * something to tune against.
 */
function NoMatchCard({ unmatched }: { unmatched: Unmatched[] }) {
  const lifts = unmatched.filter((t) => t.kind === "exercise");
  const groups = REJECTION_GROUPS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>No match -- {unmatched.length} keep their search link ({lifts.length} lifts)</span>
          <span className="ml-auto"><CopyButton text={() => noMatchText(unmatched)} label="Copy all groups" /></span>
        </CardTitle>
        <CardDescription>
          The search pill still works on every one of these. Grouped by the rule that turned each
          away, because each rule wants a different fix.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => {
          const rows = lifts.filter((t) => t.rejection?.reason === group.key);
          if (rows.length === 0) return null;
          return (
            <div key={group.key} className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span>{group.title} -- {rows.length}</span>
                <CopyButton
                  text={() => [`${group.title} -- ${rows.length}`, ...rows.map(rejectionLine)].join("\n")}
                />
              </p>
              <p className="text-xs text-muted-foreground">{group.blurb}</p>
              <div className="mt-1 space-y-0.5">
                {rows.slice(0, 40).map((t) => (
                  <div key={t.id} className="flex flex-wrap gap-x-2 text-xs">
                    <span className="font-medium">{t.name}</span>
                    {t.rejection?.title && (
                      <>
                        <span className="text-muted-foreground">&rarr;</span>
                        <span className="text-muted-foreground">{t.rejection.title}</span>
                      </>
                    )}
                    {t.rejection?.detail && (
                      <span className="text-muted-foreground">({t.rejection.detail})</span>
                    )}
                  </div>
                ))}
                {rows.length > 40 && (
                  <p className="text-xs text-muted-foreground">
                    ...and {rows.length - 40} more of the same kind.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
