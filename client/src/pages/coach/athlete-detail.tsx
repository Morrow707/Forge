import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AthleteProfileDialog } from "@/components/athlete-profile-dialog";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { BodyMetricsPanel } from "@/components/body-metrics-panel";
import { TestingHistoryPanel } from "@/components/testing-history-panel";
import { GoniometerPanel } from "@/components/goniometer-panel";
import { MovementScreenPanel } from "@/components/movement-screen-panel";
import { WeaknessReportPanel } from "@/components/weakness-report-panel";
import { GoalsPanel } from "@/components/goals-panel";
import { SkillSessionsPanel } from "@/components/skill-sessions-panel";
import { NutritionPanel } from "@/components/nutrition-panel";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { TrophyCase, type AthleteTrophyView } from "@/components/trophy-case";
import { WellnessHistoryDialog } from "@/components/wellness-history-dialog";
import { AcwrHistoryDialog } from "@/components/acwr-history-dialog";
import { TrainingHistoryExportDialog } from "@/components/training-history-export-dialog";
import { HealthStatusToggle, WellnessBadge, AcwrBadge, GuardianNoticeBadge, TrackingOptOutToggle, type HealthStatus } from "@/components/athlete-status-badges";
import { formatHeight } from "@/components/profile-fields-form";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { shareOrDownloadFile } from "@/lib/share-file";
import type { ReadinessLevel } from "@shared/wellness";
import type { AcwrRiskLevel } from "@shared/load";
import { TESTING_METRICS } from "@shared/testing-metrics";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Mail,
  Share2,
  FileDown,
  CalendarDays,
  UserMinus,
  Users,
} from "lucide-react";

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
};

const GENDER_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};

const SEASON_PHASE_LABEL: Record<string, string> = {
  off_season: "Off-season",
  pre_season: "Pre-season",
  in_season: "In-season",
  taper: "Taper / playoffs",
};

/** Read-only trophy view, embedded straight in the Trophies tab -- no dialog,
 * just the fetch the old TrophyCaseDialog used to do plus the shared
 * TrophyCase renderer. */
function AthleteTrophiesTab({ fetchUrl }: { fetchUrl: string }) {
  const { data = [], isLoading } = useQuery<AthleteTrophyView[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-surface" />;
  return <TrophyCase trophies={data} emptyHint="No trophies unlocked yet." />;
}

/** A single athlete's full profile -- everything the roster card used to
 * cram into a row of icon buttons now lives here instead, scoped strictly
 * to this one athlete (never a roster-wide or team-wide view; those stay on
 * the Analytics/Leaderboard pages). Reached by clicking an athlete anywhere
 * in the app. Every tab renders its content directly on the page (not in a
 * popup) -- there's plenty of room, and switching tabs is one click instead
 * of open-dialog-then-close-dialog. */
export default function AthleteDetailPage() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const id = Number(athleteId);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // Lets the Nutrition list page (and anywhere else) deep-link straight to
  // a specific tab -- e.g. /coach/roster/123?tab=nutrition -- instead of
  // always landing on Body Metrics and making the coach click again.
  const initialTab = new URLSearchParams(useSearch()).get("tab") || "metrics";
  const [activeTab, setActiveTab] = useState(initialTab);

  const { data: athlete, isLoading } = useQuery<Athlete>({
    queryKey: [`/api/coach/roster/${id}`],
  });

  const { data: wellnessToday = [] } = useQuery<
    { athleteId: number; score: number; level: ReadinessLevel }[]
  >({
    queryKey: ["/api/coach/roster-wellness"],
    refetchInterval: 60_000,
  });
  const wellness = wellnessToday.find((w) => w.athleteId === id);

  const { data: acwrToday = [] } = useQuery<
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
  const [sharingProfile, setSharingProfile] = useState(false);

  const sendReportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/coach/roster/${id}/progress-report`);
      return res.json() as Promise<{ sent: boolean; error?: string }>;
    },
    onSuccess: (result) => {
      if (result.sent) {
        toast.success("Progress report emailed");
      } else if (result.error === "not_configured") {
        toast.info("Email sending isn't set up yet -- ask your Forge admin to configure it.");
      } else {
        toast.error("Couldn't send that report -- try again in a bit.");
      }
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send that report"),
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
      toast.success(`${athlete?.name ?? "Athlete"} removed from your roster`);
      navigate("/coach/roster");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not remove that athlete"),
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
      toast.error("Couldn't generate that recruiting profile");
    } finally {
      setSharingProfile(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell title="Loading…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  if (!athlete) {
    return (
      <AppShell title="Athlete Not Found">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              This athlete isn't on your roster (or was removed).
            </p>
            <Button onClick={() => navigate("/coach/roster")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Roster
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const profileStats: { label: string; value: string }[] = [];
  if (athlete.age != null) profileStats.push({ label: "Age", value: `${athlete.age}` });
  if (athlete.gender) profileStats.push({ label: "Gender", value: GENDER_LABEL[athlete.gender] ?? athlete.gender });
  if (athlete.heightIn != null) {
    const h = formatHeight(athlete.heightIn);
    if (h) profileStats.push({ label: "Height", value: h });
  }
  if (athlete.bodyWeightLbs != null) {
    profileStats.push({ label: "Weight", value: `${athlete.bodyWeightLbs} lbs` });
  }
  if (athlete.seasonPhase) {
    profileStats.push({
      label: "Season Phase",
      value: SEASON_PHASE_LABEL[athlete.seasonPhase] ?? athlete.seasonPhase,
    });
  }

  const testingStats: { label: string; value: string }[] = TESTING_METRICS.flatMap((m) => {
    const raw = athlete[m.key];
    return raw == null ? [] : [{ label: m.label as string, value: `${raw} ${m.unit}` }];
  });

  return (
    <AppShell
      title={athlete.name}
      actions={
        <Button variant="outline" onClick={() => navigate("/coach/roster")}>
          <ArrowLeft className="h-4 w-4" />
          Roster
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
                  <WellnessBadge entry={wellness} onClick={() => setWellnessOpen(true)} />
                  <AcwrBadge entry={acwr} onClick={() => setAcwrOpen(true)} />
                  <GuardianNoticeBadge athleteId={athlete.id} />
                  <TrackingOptOutToggle athleteId={athlete.id} trackingOptOut={athlete.trackingOptOut ?? false} />
                </div>
                <p className="text-sm text-muted-foreground">{athlete.email}</p>
                {(athlete.sport || athlete.position) && (
                  <div className="flex flex-wrap gap-1.5">
                    {athlete.sport && <Badge variant="secondary">{athlete.sport}</Badge>}
                    {athlete.position && <Badge variant="outline">{athlete.position}</Badge>}
                  </div>
                )}
                <Button size="sm" variant="ghost" className="self-start" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Profile
                </Button>
              </CardContent>
            </Card>

            <section className="space-y-2">
              <h3 className="label-xs">
                Profile Details
              </h3>
              <Card>
                <CardContent className="p-5">
                  {profileStats.length === 0 && testingStats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No profile details yet -- click Edit Profile above to add age, height,
                      weight, and testing numbers.
                    </p>
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
                            Testing Maxes
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
                Communication &amp; Sharing
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={sendReportMutation.isPending}
                  onClick={() => sendReportMutation.mutate()}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email Report
                </Button>
                <Button variant="outline" disabled={sharingProfile} onClick={handleShareRecruitingProfile}>
                  <Share2 className="h-3.5 w-3.5" />
                  Share Profile
                </Button>
                <Button variant="outline" onClick={() => setExportOpen(true)}>
                  <FileDown className="h-3.5 w-3.5" />
                  Export History
                </Button>
                <Button variant="outline" onClick={() => setCalendarOpen(true)}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  Export Calendar
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="label-xs text-destructive">
                Danger Zone
              </h3>
              <Card className="border-destructive/40">
                <CardContent className="space-y-3 p-4">
                  <div>
                    <p className="text-sm font-medium">Remove from your roster</p>
                    <p className="text-xs text-muted-foreground">
                      {athlete.name} reverts to Free Agent status. Their account and training
                      history stay intact.
                    </p>
                  </div>
                  <Button variant="destructive" className="w-full" onClick={() => setRemoveOpen(true)}>
                    <UserMinus className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </CardContent>
              </Card>
            </section>
          </div>

          <div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="metrics">Body Metrics</TabsTrigger>
                <TabsTrigger value="testing">Testing History</TabsTrigger>
                <TabsTrigger value="rom">Goniometer</TabsTrigger>
                <TabsTrigger value="movement-screen">Movement Screen</TabsTrigger>
                <TabsTrigger value="weakness">Weakness Report</TabsTrigger>
                <TabsTrigger value="goals">Goals</TabsTrigger>
                <TabsTrigger value="skills">Skill Clips</TabsTrigger>
                <TabsTrigger value="trophies">Trophies</TabsTrigger>
                <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
                <TabsTrigger value="chat">AI Chat</TabsTrigger>
              </TabsList>

              <TabsContent value="metrics">
                <Card>
                  <CardContent className="p-5">
                    <BodyMetricsPanel
                      athleteName={athlete.name}
                      fetchUrl={`/api/coach/roster/${athlete.id}/body-metrics`}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="testing">
                <Card>
                  <CardContent className="p-5">
                    <TestingHistoryPanel fetchUrl={`/api/coach/roster/${athlete.id}/testing-history`} />
                  </CardContent>
                </Card>
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
                  <CardContent className="p-5">
                    <SkillSessionsPanel athleteName={athlete.name} athleteId={athlete.id} />
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
        title={`${athlete.name}'s Calendar`}
        fetchUrl={`/api/coach/roster/${athlete.id}/calendar-link`}
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
            <DialogTitle>Remove {athlete.name} from your roster?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            They'll lose access to your programs, calendar, and roster tools. Their training
            history and account stay intact -- this just takes them off your roster, so you can
            always re-add them later with your coach code.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveOpen(false)}
              disabled={removeAthleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={removeAthleteMutation.isPending}
              onClick={() => removeAthleteMutation.mutate()}
            >
              {removeAthleteMutation.isPending ? "Removing..." : "Remove Athlete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
