import { BarSpeedTab } from "@/components/bar-speed-tab";
import { ReturnToTrainingClearanceCard } from "@/components/return-to-training-clearance-card";
import { athleteTabInteraction } from "@shared/feature-usage";
import { SingleSportYearNote, ThrowingWorkloadPanel } from "@/components/athlete-workload-notes";
import { countInteraction } from "@/lib/feature-usage";
import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { lazyDialog } from "@/components/lazy-dialog";
import { VideoReviewList } from "@/components/video-review-list";
import { StrengthProfileCard } from "@/components/strength-profile-card";
import { CoachVideoWorkbenchCard } from "@/components/video-workbench";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AthleteProfileDialog } from "@/components/athlete-profile-dialog";
import { AthleteSwitcher } from "@/components/athlete-switcher";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { BodyMetricsPanel } from "@/components/body-metrics-panel";
import { AthleteDeviceData } from "@/components/athlete-device-data";
import { StandingHeightPanel } from "@/components/standing-height-panel";
import { ImportedTestingDataPanel } from "@/components/imported-testing-data-panel";
import { TestingHistoryPanel } from "@/components/testing-history-panel";
import { GoniometerPanel } from "@/components/goniometer-panel";
import { MovementScreenPanel } from "@/components/movement-screen-panel";
import { WeaknessReportPanel } from "@/components/weakness-report-panel";
import { GoalsPanel } from "@/components/goals-panel";
import { SkillSessionsPanel } from "@/components/skill-sessions-panel";
import { AnvilAthletePanel } from "@/components/anvil-athlete-panel";
import { NutritionPanel } from "@/components/nutrition-panel";
import { AiChatPanel } from "@/components/ai-chat-panel";
import type { TrophyDefinition } from "@shared/achievements";
import { TrophyCase, type AthleteTrophyView } from "@/components/trophy-case";
import { WellnessHistoryDialog } from "@/components/wellness-history-dialog";
import { AcwrHistoryDialog } from "@/components/acwr-history-dialog";
import { TrainingHistoryExportDialog } from "@/components/training-history-export-dialog";
import { HealthStatusToggle, WellnessBadge, AcwrBadge, GuardianNoticeBadge, TrackingOptOutToggle, ResearchConsentControl, type HealthStatus } from "@/components/athlete-status-badges";
import { formatHeight } from "@/components/profile-fields-form";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { shareOrDownloadFile } from "@/lib/share-file";
import type { ReadinessLevel } from "@shared/wellness";
import type { AcwrRiskLevel } from "@shared/load";
import { TESTING_METRICS } from "@shared/testing-metrics";
import type { PublicUser } from "@shared/schema";
import { toast } from "sonner";
import { ReadFailed } from "@/components/read-failed";
import {
  ArrowLeft,
  GitCompare,
  Pencil,
  Mail,
  Share2,
  FileDown,
  CalendarDays,
  UserMinus,
  Users,
  Pin,
  PauseCircle,
  RotateCcw,
} from "lucide-react";
import { msg, useT } from "@/i18n";
import { TranslatableText } from "@/components/translatable-text";

type Athlete = {
  id: number;
  name: string;
  email: string;
  age?: number | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  heightIn?: number | null;
  bodyWeightLbs?: number | null;
  sport?: string | null;
  position?: string | null;
  seasonPhase?: string | null;
  trainingStylePreference?: string | null;
  fortyYardDash?: number | null;
  verticalJumpIn?: number | null;
  broadJumpIn?: number | null;
  proAgilitySeconds?: number | null;
  threeConeSeconds?: number | null;
  benchMaxLbs?: number | null;
  squatMaxLbs?: number | null;
  deadliftMaxLbs?: number | null;
  healthStatus?: HealthStatus;
  trackingOptOut?: boolean | null;
  /** The off-season hold (shared/roster-hold.ts). getRosterAthleteForCoach carries these on
   *  purpose: a parked athlete's detail page must still OPEN -- filtering them out here is what
   *  would make a hold indistinguishable from the removal it exists to replace. */
  heldAt?: string | null;
  heldUntil?: string | null;
};

const GENDER_LABEL: Record<string, string> = {
  male: msg("Male"),
  female: msg("Female"),
  non_binary: msg("Non-binary"),
  prefer_not_to_say: msg("Prefer not to say"),
};

const SEASON_PHASE_LABEL: Record<string, string> = {
  off_season: msg("Off-season"),
  pre_season: msg("Pre-season"),
  in_season: msg("In-season"),
  taper: msg("Taper / playoffs"),
};

/** Read-only trophy view, embedded straight in the Trophies tab -- no dialog,
 * just the fetch the old TrophyCaseDialog used to do plus the shared
 * TrophyCase renderer. */
function AthleteTrophiesTab({ fetchUrl }: { fetchUrl: string }) {
  const t = useT();
  const { data = [], isLoading, isError, refetch } = useQuery<AthleteTrophyView[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  // The program's own trophies: ".../roster/7/trophies" becomes ".../roster/7/program-trophies".
  const programUrl = fetchUrl.replace(/\/trophies$/, "/program-trophies");
  const { data: programTrophies = [] } = useQuery<TrophyDefinition[]>({
    queryKey: [programUrl],
    queryFn: () => getJson(programUrl),
  });
  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-surface" />;
  if (isError) return <ReadFailed what={t("this athlete's trophies")} onRetry={() => void refetch()} />;
  return <TrophyCase trophies={data} programTrophies={programTrophies} emptyHint="No trophies unlocked yet." />;
}

/** A single athlete's full profile -- everything the roster card used to
 * cram into a row of icon buttons now lives here instead, scoped strictly
 * to this one athlete (never a roster-wide or team-wide view; those stay on
 * the Analytics/Leaderboard pages). Reached by clicking an athlete anywhere
 * in the app. Every tab renders its content directly on the page (not in a
 * popup) -- there's plenty of room, and switching tabs is one click instead
 * of open-dialog-then-close-dialog. */
/** "This athlete has filmed sets that never reached a set." Read from the server's
 * unattached_video_uploads list (the per-device localStorage list is not visible here, and
 * cannot be). The coach cannot link a clip -- only the athlete knows which set it was -- so
 * this is a note, not an action: it stops a day that reads "3 sets, no video" from being taken
 * as "did not film". Renders nothing when there is nothing to say, including on a read failure,
 * which is the right answer for an informational aside rather than a spinner or an error box. */
function UnattachedClipsNote({ athleteId }: { athleteId: number }) {
  const t = useT();
  const route = `/api/coach/roster/${athleteId}/unattached-videos`;
  const { data } = useQuery<{ id: number; label: string | null; date: string | null; createdAt: string }[]>({
    queryKey: [route],
    queryFn: () => getJson(route),
  });
  if (!data || data.length === 0) return null;
  return (
    <Card className="border-amber-500/40" data-testid="coach-unattached-clips">
      <CardContent className="space-y-1.5 p-4">
        <p className="text-sm font-medium">
          {data.length === 1 ? t("1 clip uploaded but not linked to a set") : t("{count} clips uploaded but not linked to a set", { count: data.length })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("The athlete filmed these, the upload landed, and the set had changed by the time it did. They can link each one from their Video Bank; until then a day with no video may still have been filmed.")}
        </p>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {data.slice(0, 5).map((c) => (
            <li key={c.id} className="truncate">
              {c.label ?? t("Form check clip")}
              {c.date ? ` · ${t("filmed {date}", { date: c.date })}` : ""}
            </li>
          ))}
          {data.length > 5 && <li>{t("…and {count} more", { count: data.length - 5 })}</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

const VideoCompareDialog = lazyDialog(() =>
  import("@/components/video-compare").then((m) => ({ default: m.VideoCompareDialog })),
);

export default function AthleteDetailPage() {
  const t = useT();
  const { athleteId } = useParams<{ athleteId: string }>();
  const id = Number(athleteId);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  // Lets the Nutrition list page (and anywhere else) deep-link straight to
  // a specific tab -- e.g. /coach/roster/123?tab=nutrition -- instead of
  // always landing on Body Metrics and making the coach click again.
  const initialTab = new URLSearchParams(useSearch()).get("tab") || "metrics";
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: athlete, isLoading, isError, error, refetch } = useQuery<Athlete>({
    queryKey: [`/api/coach/roster/${id}`],
  });

  const { data: wellnessToday = [], isError: wellnessFailed } = useQuery<
    { athleteId: number; score: number; level: ReadinessLevel }[]
  >({
    queryKey: ["/api/coach/roster-wellness"],
    refetchInterval: 60_000,
  });
  const wellness = wellnessToday.find((w) => w.athleteId === id);

  const { data: acwrToday = [], isError: acwrFailed } = useQuery<
    { athleteId: number; ratio: number | null; level: AcwrRiskLevel }[]
  >({
    queryKey: ["/api/coach/roster-acwr"],
    refetchInterval: 60_000,
  });
  const acwr = acwrToday.find((w) => w.athleteId === id);

  const [editOpen, setEditOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false);
  const [acwrOpen, setAcwrOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  /** The expected return date on a hold -- optional, and it drives the roster screen's due-back
   *  prompt rather than any automatic action (see seatIsDueBack). */
  const [holdUntilInput, setHoldUntilInput] = useState("");
  // Lazily fetched the first time a coach compares, not with this page -- the compare tool
  // pulls in the skeleton renderer and the clip picker, and most visits to an athlete never
  // open it. Same lazyDialog treatment as the analysis dialog (see set-video-review.tsx).
  const [comparing, setComparing] = useState(false);
  const [sharingProfile, setSharingProfile] = useState(false);

  const sendReportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coach/roster/${id}/progress-report`);
      return res.json() as Promise<{ sent: boolean; error?: string }>;
    },
    onSuccess: (result) => {
      if (result.sent) {
        toast.success(t("Progress report emailed"));
      } else if (result.error === "not_configured") {
        toast.info(t("Email sending isn't set up yet, ask your Forge admin to configure it."));
      } else {
        toast.error(t("Couldn't send that report, try again in a bit."));
      }
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't send that report")),
  });

  const removeAthleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/coach/roster/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster-wellness"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster-acwr"] });
      toast.success(t("{name} removed from your roster", { name: athlete?.name ?? t("Athlete") }));
      navigate("/coach/roster");
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not remove that athlete")),
  });

  /* PARK THIS SEAT, OR BRING IT BACK. The gentler sibling of the removal below, and the one a
   * coach wants when an athlete is coming back: the relationship survives, so this is undone by
   * the coach alone, where a removal needs the ATHLETE to re-enter the coach code. See
   * shared/roster-hold.ts. */
  const holdMutation = useMutation({
    mutationFn: async (heldUntil: string | null) => {
      await apiRequest("POST", `/api/coach/roster/${id}/hold`, { heldUntil });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/coach/roster/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/plan"] });
      toast.success(t("{name} is on hold", { name: athlete?.name ?? t("Athlete") }));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't put them on hold")),
  });

  const unholdMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/coach/roster/${id}/unhold`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/coach/roster/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/plan"] });
      toast.success(t("{name} is back on your roster", { name: athlete?.name ?? t("Athlete") }));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't bring them back")),
  });

  // "Pinned" reads straight off the logged-in coach's own /api/auth/me
  // cache (see shared/schema.ts users.pinnedAthleteIds) -- no separate
  // fetch needed, same as hiddenSections/personalAccentColor elsewhere.
  const isPinned = !!user?.pinnedAthleteIds?.includes(id);

  const pinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/coach/roster/${id}/pin`);
      return (await res.json()) as { pinned: boolean; pinnedAthleteIds: number[] };
    },
    onSuccess: (result) => {
      qc.setQueryData<PublicUser | null | undefined>(["/api/auth/me"], (old) =>
        old ? { ...old, pinnedAthleteIds: result.pinnedAthleteIds } : old,
      );
      toast.success(
        result.pinned
          ? t("{name} pinned for quick access", { name: athlete?.name ?? t("Athlete") })
          : t("{name} unpinned", { name: athlete?.name ?? t("Athlete") }),
      );
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't update pin")),
  });

  async function handleShareRecruitingProfile() {
    if (!athlete) return;
    setSharingProfile(true);
    try {
      await shareOrDownloadFile(
        `/api/coach/roster/${athlete.id}/recruiting-profile.pdf`,
        `${athlete.name}-recruiting-profile.pdf`,
        `${athlete.name}'s Forge Recruiting Profile`,
      );
    } catch {
      toast.error(t("Couldn't generate that recruiting profile"));
    } finally {
      setSharingProfile(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell title={t("Loading…")}>
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  // A failed read is NOT "not on your roster". Saying so would tell a coach an
  // athlete had been removed on the strength of a dropped request.
  if (isError) {
    return (
      <AppShell title={t("Athlete")}>
        <Card>
          <CardContent className="py-12">
            <ReadFailed what={t("this athlete's profile")} error={error} onRetry={() => void refetch()} />
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (!athlete) {
    return (
      <AppShell title={t("Athlete Not Found")}>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {t("This athlete isn't on your roster (or was removed).")}
            </p>
            <Button onClick={() => navigate("/coach/roster")}>
              <ArrowLeft className="h-4 w-4" />
              {t("Back to Roster")}
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const profileStats: { label: string; value: string }[] = [];
  if (athlete.age != null) profileStats.push({ label: t("Age"), value: `${athlete.age}` });
  if (athlete.gender) profileStats.push({ label: t("Gender"), value: GENDER_LABEL[athlete.gender] ? t(GENDER_LABEL[athlete.gender]) : athlete.gender });
  if (athlete.heightIn != null) {
    const h = formatHeight(athlete.heightIn);
    if (h) profileStats.push({ label: t("Height"), value: h });
  }
  if (athlete.bodyWeightLbs != null) {
    profileStats.push({ label: t("Weight"), value: `${athlete.bodyWeightLbs} lbs` });
  }
  if (athlete.seasonPhase) {
    profileStats.push({
      label: t("Season Phase"),
      value: SEASON_PHASE_LABEL[athlete.seasonPhase] ? t(SEASON_PHASE_LABEL[athlete.seasonPhase]) : athlete.seasonPhase,
    });
  }

  const testingStats: { label: string; value: string }[] = TESTING_METRICS.flatMap((m) => {
    const raw = athlete[m.key];
    return raw == null ? [] : [{ label: t(m.label as string), value: `${raw} ${m.unit}` }];
  });

  return (
    <AppShell
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{athlete.name}</span>
          <Button
            type="button"
            variant={isPinned ? "default" : "outline"}
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={pinMutation.isPending}
            onClick={() => pinMutation.mutate()}
            aria-label={isPinned ? t("Unpin {name} from quick access", { name: athlete.name }) : t("Pin {name} for quick access", { name: athlete.name })}
            title={isPinned ? t("Unpin from quick access") : t("Pin for quick access")}
          >
            <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />
          </Button>
          <AthleteSwitcher currentAthleteId={athlete.id} />
        </span>
      }
      actions={
        <Button variant="outline" onClick={() => navigate("/coach/roster")}>
          <ArrowLeft className="h-4 w-4" />
          {t("Roster")}
        </Button>
      }
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="space-y-6">
            <Card>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <HealthStatusToggle athleteId={athlete.id} status={athlete.healthStatus ?? "healthy"} />
                  <WellnessBadge
                    entry={wellness}
                    unavailable={wellnessFailed}
                    onClick={() => setWellnessOpen(true)}
                  />
                  <AcwrBadge entry={acwr} unavailable={acwrFailed} onClick={() => setAcwrOpen(true)} />
                  <GuardianNoticeBadge athleteId={athlete.id} />
                  <TrackingOptOutToggle athleteId={athlete.id} trackingOptOut={athlete.trackingOptOut ?? false} />
                  <ResearchConsentControl athleteId={athlete.id} />
                </div>
                <p className="text-sm text-muted-foreground">{athlete.email}</p>
                {(athlete.sport || athlete.position) && (
                  <div className="flex flex-wrap gap-1.5">
                    {athlete.sport && <Badge variant="secondary">{athlete.sport}</Badge>}
                    {athlete.position && <Badge variant="outline">{athlete.position}</Badge>}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {t("Edit Profile")}
                  </Button>
                  {/* A private thread with this athlete; the server decides whether it is open. */}
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/coach/messages?athlete=${athlete.id}`)} data-testid="button-message-athlete">
                    <Mail className="h-3.5 w-3.5" />
                    {t("Message")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <ReturnToTrainingClearanceCard athleteId={athlete.id} />

            <UnattachedClipsNote athleteId={athlete.id} />

            <ExerciseRegressionsCard athleteId={athlete.id} />

            <section className="space-y-2">
              <h3 className="label-xs">
                {t("Profile Details")}
              </h3>
              <Card>
                <CardContent className="p-5">
                  {profileStats.length === 0 && testingStats.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-4 text-center">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Pencil className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold">{t("No profile details yet")}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("Add age, height, weight, and testing numbers to fill this out.")}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setEditOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                        {t("Edit Profile")}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {profileStats.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          {profileStats.map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {label}
                              </p>
                              <p className="text-sm font-semibold">{value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {testingStats.length > 0 && (
                        <div>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t("Testing Maxes")}
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            {testingStats.map(({ label, value }) => (
                              <div key={label}>
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  {label}
                                </p>
                                <p className="text-sm font-semibold">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="space-y-2">
              <h3 className="label-xs">
                {t("Communication & Sharing")}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={sendReportMutation.isPending}
                  onClick={() => sendReportMutation.mutate()}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {t("Email Report")}
                </Button>
                <Button variant="outline" disabled={sharingProfile} onClick={handleShareRecruitingProfile}>
                  <Share2 className="h-3.5 w-3.5" />
                  {t("Share Profile")}
                </Button>
                <Button variant="outline" onClick={() => setExportOpen(true)}>
                  <FileDown className="h-3.5 w-3.5" />
                  {t("Export History")}
                </Button>
                <Button variant="outline" onClick={() => setCalendarOpen(true)}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  {t("Export Calendar")}
                </Button>
              </div>
            </section>

            {/* ABOVE the Danger Zone and not inside it, because a hold is the reversible one:
                nothing is deleted, the coach undoes it alone, and it is what somebody reaching
                for Remove in June actually wants. */}
            <section className="space-y-2">
              <h3 className="label-xs">{t("Off-season")}</h3>
              <Card>
                <CardContent className="space-y-3 p-4">
                  {athlete.heldAt ? (
                    <>
                      <div>
                        <p className="text-sm font-medium">{t("On hold")}</p>
                        <p className="text-xs text-muted-foreground">
                          {athlete.heldUntil
                            ? `${t("Expected back {date}.", { date: athlete.heldUntil })} `
                            : `${t("No return date set.")} `}
                          {t("You aren't billed for this seat and nothing new can be assigned to it. Everything they've logged is still here.")}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={unholdMutation.isPending}
                        onClick={() => unholdMutation.mutate()}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {unholdMutation.isPending ? t("Bringing back...") : t("Bring back on roster")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div>
                        <p className="text-sm font-medium">{t("Put on hold")}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("For an athlete coming back next season. You stop being billed for the seat, nothing new can be assigned, and everything they've logged stays yours to read. You bring them back yourself -- they don't re-enter your coach code.")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="date"
                          value={holdUntilInput}
                          onChange={(e) => setHoldUntilInput(e.target.value)}
                          className="h-9 w-40"
                          aria-label={t("Expected return date (optional)")}
                        />
                        <Button
                          variant="secondary"
                          className="flex-1"
                          disabled={holdMutation.isPending}
                          onClick={() => holdMutation.mutate(holdUntilInput || null)}
                        >
                          <PauseCircle className="h-3.5 w-3.5" />
                          {holdMutation.isPending ? t("Holding...") : t("Put on hold")}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="space-y-2">
              <h3 className="label-xs text-destructive">
                {t("Danger Zone")}
              </h3>
              <Card className="border-destructive/40">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <p className="text-sm font-medium">{t("Remove from your roster")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("For an athlete who isn't coming back. {name} reverts to Free Agent status; their account and training history stay intact, but you won't be able to open any of it, and only they can rejoin. Coming back next season? Put them on hold instead.", { name: athlete.name })}
                    </p>
                  </div>
                  <Button variant="destructive" className="w-full" onClick={() => setRemoveOpen(true)}>
                    <UserMinus className="h-3.5 w-3.5" />
                    {t("Remove")}
                  </Button>
                </CardContent>
              </Card>
            </section>
          </div>

          <div>
            <SingleSportYearNote athleteId={athlete.id} />
            <Tabs
              value={activeTab}
              onValueChange={(tab) => {
                setActiveTab(tab);
                const counted = athleteTabInteraction(tab);
                if (counted) countInteraction(counted);
              }}
            >
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="metrics">{t("Body Metrics")}</TabsTrigger>
                <TabsTrigger value="testing">{t("Testing History")}</TabsTrigger>
                <TabsTrigger value="bar-speed">{t("Bar Speed")}</TabsTrigger>
                <TabsTrigger value="throwing">{t("Throwing")}</TabsTrigger>
                <TabsTrigger value="rom">{t("Goniometer")}</TabsTrigger>
                <TabsTrigger value="movement-screen">{t("Movement Screen")}</TabsTrigger>
                <TabsTrigger value="weakness">{t("Weakness Report")}</TabsTrigger>
                <TabsTrigger value="goals">{t("Goals")}</TabsTrigger>
                <TabsTrigger value="skills">{t("Skill Clips")}</TabsTrigger>
                <TabsTrigger value="trophies">{t("Trophies")}</TabsTrigger>
                <TabsTrigger value="nutrition">{t("Nutrition")}</TabsTrigger>
                <TabsTrigger value="chat">{t("AI Chat")}</TabsTrigger>
              </TabsList>

              <TabsContent value="metrics">
                <Card>
                  <CardContent className="p-5">
                    <BodyMetricsPanel
                      athleteName={athlete.name}
                      fetchUrl={`/api/coach/roster/${athlete.id}/body-metrics`}
                    />
                    {/* Height sits with the weigh-in because that is the act it rides along with:
                        a testing day with a coach holding the tape is where it is measured far
                        more often than it is typed at home. Same component as the athlete's own
                        page, so the two prompts cannot drift apart. */}
                    <div className="mt-6 border-t pt-4">
                      <StandingHeightPanel
                        athleteName={athlete.name}
                        fetchUrl={`/api/coach/roster/${athlete.id}/heights`}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="testing">
                <Card>
                  <CardContent className="p-5">
                    <TestingHistoryPanel fetchUrl={`/api/coach/roster/${athlete.id}/testing-history`} />
                  </CardContent>
                </Card>
                <ImportedTestingDataPanel athleteId={athlete.id} />
                <div className="mt-4">
                  <AthleteDeviceData athleteId={athlete.id} />
                </div>
              </TabsContent>

              <TabsContent value="bar-speed">
                <BarSpeedTab athleteId={athlete.id} athleteName={athlete.name} />
              </TabsContent>

              <TabsContent value="throwing">
                <ThrowingWorkloadPanel athleteId={athlete.id} />
              </TabsContent>

              <TabsContent value="rom">
                <Card>
                  <CardContent className="p-5">
                    <GoniometerPanel athleteId={athlete.id} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="movement-screen">
                <Card>
                  <CardContent className="p-5">
                    <MovementScreenPanel athleteId={athlete.id} />
                  </CardContent>
                </Card>
                <Card className="mt-4">
                  <CardContent className="p-5">
                    <SuggestedCorrectives athleteId={athlete.id} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="weakness">
                <Card>
                  <CardContent className="p-5">
                    <WeaknessReportPanel
                      fetchUrl={`/api/coach/roster/${athlete.id}/weakness-reports`}
                      generateUrl={`/api/coach/roster/${athlete.id}/weakness-report`}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="goals">
                <Card>
                  <CardContent className="p-5">
                    <GoalsPanel
                      goalsUrl={`/api/coach/roster/${athlete.id}/goals`}
                      exercisesUrl={`/api/coach/analytics/exercises?athleteId=${athlete.id}`}
                      skillExercisesUrl={`/api/coach/analytics/skill-exercises?athleteId=${athlete.id}`}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="skills">
                <Card>
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-muted-foreground">
                        {t("Put any two of {name}'s clips side by side, or against a teammate's.", { name: athlete.name })}
                      </p>
                      <Button size="sm" variant="secondary" onClick={() => setComparing(true)}>
                        <GitCompare className="h-3.5 w-3.5" />
                        {t("Compare clips")}
                      </Button>
                    </div>
                    <SkillSessionsPanel athleteName={athlete.name} athleteId={athlete.id} />

                    <AnvilAthletePanel athleteName={athlete.name} athleteId={athlete.id} />

                    {/* The same profile the athlete sees, so a coach and their athlete are
                        reading one number rather than two that can disagree. */}
                    <div className="space-y-2 border-t border-border pt-4">
                      <StrengthProfileCard
                        fetchUrl={`/api/coach/roster/${athlete.id}/strength-profile`}
                      />
                    </div>

                    {/* The same workbench the Free Agent add-on sells, unpaid for a coach:
                        video review is what the coach product IS, and the add-on exists so an
                        athlete with no coach can do for themselves what a coach would
                        otherwise do for them. Charging a coach for their own tool would be
                        backwards. */}
                    <div className="space-y-2 border-t border-border pt-4">
                      <CoachVideoWorkbenchCard athleteId={athlete.id} athleteName={athlete.name} />
                    </div>

                    {/* Saved reviews for this athlete. Lives beside the clips they were made
                        from, which is where a coach goes looking for them. */}
                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-sm font-semibold">{t("Saved reviews")}</p>
                      <VideoReviewList
                        mode="coach"
                        fetchUrl={`/api/coach/video-reviews?athleteId=${athlete.id}`}
                        reviewUrl={(id) => `/api/coach/video-reviews/${id}`}
                        emptyHint="No saved reviews for this athlete yet. Compare two clips, then save what you drew."
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="trophies">
                <Card>
                  <CardContent className="p-5">
                    <AthleteTrophiesTab fetchUrl={`/api/coach/roster/${athlete.id}/trophies`} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="nutrition">
                <Card>
                  <CardContent className="p-5">
                    <NutritionPanel
                      nutritionUrl={`/api/coach/roster/${athlete.id}/nutrition`}
                      editable
                      foodLogUrl={`/api/coach/roster/${athlete.id}/food-log`}
                      foodLogEditable={false}
                      trendUrl={`/api/coach/roster/${athlete.id}/nutrition/trend`}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="chat">
                <div className="flex h-[65vh] flex-col">
                  <AiChatPanel
                    fetchUrl={`/api/coach/roster/${athlete.id}/chat`}
                    athleteName={athlete.name}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <AthleteProfileDialog
        athlete={editOpen ? athlete : null}
        onOpenChange={(open) => !open && setEditOpen(false)}
      />

      <CalendarLinkDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        title={t("{name}'s Calendar", { name: athlete.name })}
        fetchUrl={`/api/coach/roster/${athlete.id}/calendar-link`}
        showImport={false}
      />

      <WellnessHistoryDialog
        open={wellnessOpen}
        onOpenChange={setWellnessOpen}
        athleteName={athlete.name}
        fetchUrl={`/api/coach/roster/${athlete.id}/wellness-history`}
      />

      <AcwrHistoryDialog
        open={acwrOpen}
        onOpenChange={setAcwrOpen}
        athleteName={athlete.name}
        fetchUrl={`/api/coach/roster/${athlete.id}/acwr-history`}
      />

      {/* Subject is the ROSTER athlete, not the coach: the picker's "this athlete" source has to
          be the person whose page this is, and its second source is the rest of the coach's
          roster. Per-team narrowing and the minors rules are enforced server-side by the clip
          list route, never by what the picker chooses to show. */}
      <VideoCompareDialog
        open={comparing}
        onOpenChange={setComparing}
        subject={{ kind: "roster", athleteId: athlete.id, athleteName: athlete.name }}
        title={t("Compare {name}'s clips", { name: athlete.name })}
      />

      <TrainingHistoryExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        athleteName={athlete.name}
        csvUrl={`/api/coach/roster/${athlete.id}/training-history.csv`}
        pdfUrl={`/api/coach/roster/${athlete.id}/training-history.pdf`}
      />

      <Dialog
        open={removeOpen}
        onOpenChange={(open) => {
          if (!open && !removeAthleteMutation.isPending) setRemoveOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Remove {name} from your roster?", { name: athlete.name })}</DialogTitle>
          </DialogHeader>
          {/* THE OLD COPY PROMISED SOMETHING THE COACH CANNOT DO: "you can always re-add them
              later with your coach code". The coach HAS no way to re-add them -- sendFreeAgentRequest
              needs the athlete's acceptance and the code is theirs to type, so in August that is
              a chase. Saying so is the whole reason the hold above exists. */}
          <p className="text-sm text-muted-foreground">
            {t("Their training history and account stay intact, but you'll no longer be able to open any of it -- their sessions, numbers and videos all go dark to you. Rejoining is theirs to do: they'd have to enter your coach code again, you can't put them back yourself.")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("If they're coming back next season, close this and use Put on hold instead -- you stop paying for the seat, you keep reading everything they've logged, and one tap brings them back.")}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveOpen(false)}
              disabled={removeAthleteMutation.isPending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeAthleteMutation.isPending}
              onClick={() => removeAthleteMutation.mutate()}
            >
              {removeAthleteMutation.isPending ? t("Removing...") : t("Remove Athlete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/**
 * Corrective work drafted from what is already on file.
 *
 * On the athlete's own screening tab, beside the movement screen the
 * suggestions are partly drawn from, because that is where a coach is
 * already thinking about this athlete's limitations.
 *
 * A DRAFT, and the copy says so. The coach applies it through the corrective
 * editor that already exists -- an athlete's rehab work is not something
 * software changes unattended, and nothing here writes.
 *
 * Asked for on demand rather than fetched on page load: it is several model
 * calls, and most visits to this tab are not about correctives.
 */
function SuggestedCorrectives({ athleteId }: { athleteId: number }) {
  const t = useT();
  const [result, setResult] = useState<{
    summary: string;
    correctives: { exerciseId: number; exerciseName: string; sets: number; reps: string; why: string }[];
  } | null>(null);

  const suggest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coach/roster/${athleteId}/suggest-correctives`);
      return res.json();
    },
    onSuccess: (data) => setResult(data),
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't draft correctives")),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{t("Suggested correctives")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Drafted from this athlete's repeated soreness, screen findings and unresolved injuries. Nothing is applied, add what you agree with in the corrective editor.")}
          </p>
        </div>
        <Button size="sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
          {suggest.isPending ? t("Thinking...") : t("Draft suggestions")}
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <p className="text-sm">{result.summary}</p>
          {result.correctives.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("Nothing on file suggests corrective work right now.")}
            </p>
          ) : (
            result.correctives.map((c) => (
              <div key={c.exerciseId} className="rounded-md border px-3 py-2">
                <p className="text-sm font-medium">
                  {t.exercise(c.exerciseName)} — {c.sets} x {c.reps}
                </p>
                <p className="text-xs text-muted-foreground">{c.why}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Every "this is too hard" this athlete has asked for, newest first.
 *
 * The whole reason regressExerciseForAthlete writes a row instead of just
 * answering the athlete: one regression is ordinary, the same lift three weeks
 * running is a conversation, and a coach who never sees either cannot have it.
 * Renders nothing when there is nothing to show, so it costs a quiet roster no
 * space at all. */
function ExerciseRegressionsCard({ athleteId }: { athleteId: number }) {
  const t = useT();
  const { data: regressions = [], isError: regressionsFailed, refetch: refetchRegressions } = useQuery<
    {
      id: number;
      date: string;
      exerciseName: string;
      sets: number;
      reps: string;
      prescribedSets: number;
      prescribedReps: string;
      loadHint: string;
      summary: string;
      athleteNote: string | null;
    }[]
  >({
    queryKey: [`/api/coach/roster/${athleteId}/regressions`],
  });

  // Unlike the empty case, a failed read still takes space: "no regressions logged"
  // is a claim about how an athlete has been training, and this card is the only
  // place a coach would see the three-weeks-running pattern it exists to surface.
  if (regressionsFailed) {
    return (
      <Card>
        <CardContent className="p-5">
          <ReadFailed
            what={t("whether this athlete has asked for something easier")}
            onRetry={() => void refetchRegressions()}
          />
        </CardContent>
      </Card>
    );
  }

  if (regressions.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="label-xs">{t("Asked for something easier")}</h3>
      <Card>
        <CardContent className="space-y-2.5 p-5">
          {regressions.slice(0, 8).map((r) => (
            <div key={r.id} className="border-l-2 border-amber-500/60 pl-2.5">
              <p className="text-sm font-semibold">
                {t.exercise(r.exerciseName)}{" "}
                <span className="font-normal text-muted-foreground">
                  · {t.date(new Date(`${r.date}T00:00:00`), { month: "short", day: "numeric" })}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {r.prescribedSets} x {r.prescribedReps} &rarr; {r.sets} x {r.reps} · {r.loadHint}
              </p>
              {r.athleteNote && (
                <TranslatableText className="mt-0.5 text-xs italic text-foreground" text={`"${r.athleteNote}"`} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
