import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AthleteProfileDialog } from "@/components/athlete-profile-dialog";
import { CalendarLinkDialog } from "@/components/calendar-link-dialog";
import { BodyMetricsDialog } from "@/components/body-metrics-dialog";
import { TestingHistoryDialog } from "@/components/testing-history-dialog";
import { GoalsDialog } from "@/components/goals-dialog";
import { SkillSessionsDialog } from "@/components/skill-sessions-dialog";
import { NutritionDialog } from "@/components/nutrition-dialog";
import { WellnessHistoryDialog } from "@/components/wellness-history-dialog";
import { AcwrHistoryDialog } from "@/components/acwr-history-dialog";
import { ChatHistoryDialog } from "@/components/chat-history-dialog";
import { TrophyCaseDialog } from "@/components/trophy-case-dialog";
import { TrainingHistoryExportDialog } from "@/components/training-history-export-dialog";
import { HealthStatusToggle, WellnessBadge, AcwrBadge, type HealthStatus } from "@/components/athlete-status-badges";
import { formatHeight } from "@/components/profile-fields-form";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { shareOrDownloadFile } from "@/lib/share-file";
import type { ReadinessLevel } from "@shared/wellness";
import type { AcwrRiskLevel } from "@shared/load";
import { TESTING_METRICS } from "@shared/testing-metrics";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Scale,
  Timer,
  Target,
  Film,
  Apple,
  Trophy,
  Sparkles,
  CalendarDays,
  Mail,
  Share2,
  FileDown,
  UserMinus,
  Users,
} from "lucide-react";

type Athlete = {
  id: number;
  name: string;
  email: string;
  age?: number | null;
  gender?: string | null;
  heightIn?: number | null;
  bodyWeightLbs?: number | null;
  sport?: string | null;
  position?: string | null;
  seasonPhase?: string | null;
  fortyYardDash?: number | null;
  verticalJumpIn?: number | null;
  broadJumpIn?: number | null;
  proAgilitySeconds?: number | null;
  benchMaxLbs?: number | null;
  squatMaxLbs?: number | null;
  deadliftMaxLbs?: number | null;
  healthStatus?: HealthStatus;
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

/** A single athlete's full profile -- everything the roster card used to
 * cram into a row of icon buttons now lives here instead, scoped strictly
 * to this one athlete (never a roster-wide or team-wide view; those stay on
 * the Analytics/Leaderboard pages). Reached by clicking an athlete anywhere
 * in the app. */
export default function AthleteDetailPage() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const id = Number(athleteId);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

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
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [testingOpen, setTestingOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [skillSessionsOpen, setSkillSessionsOpen] = useState(false);
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [wellnessOpen, setWellnessOpen] = useState(false);
  const [acwrOpen, setAcwrOpen] = useState(false);
  const [trophyOpen, setTrophyOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
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
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <HealthStatusToggle athleteId={athlete.id} status={athlete.healthStatus ?? "healthy"} />
              <WellnessBadge entry={wellness} onClick={() => setWellnessOpen(true)} />
              <AcwrBadge entry={acwr} onClick={() => setAcwrOpen(true)} />
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit Profile
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{athlete.email}</p>
            {(athlete.sport || athlete.position) && (
              <div className="flex flex-wrap gap-1.5">
                {athlete.sport && <Badge variant="secondary">{athlete.sport}</Badge>}
                {athlete.position && <Badge variant="outline">{athlete.position}</Badge>}
              </div>
            )}
          </CardContent>
        </Card>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Profile Details
          </h3>
          <Card>
            <CardContent className="p-5">
              {profileStats.length === 0 && testingStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No profile details yet -- click Edit Profile above to add age, height, weight,
                  and testing numbers.
                </p>
              ) : (
                <div className="space-y-4">
                  {profileStats.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
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
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Training
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button variant="outline" onClick={() => setMetricsOpen(true)}>
              <Scale className="h-3.5 w-3.5" />
              Body Metrics
            </Button>
            <Button variant="outline" onClick={() => setTestingOpen(true)}>
              <Timer className="h-3.5 w-3.5" />
              Testing History
            </Button>
            <Button variant="outline" onClick={() => setGoalsOpen(true)}>
              <Target className="h-3.5 w-3.5" />
              Goals
            </Button>
            <Button variant="outline" onClick={() => setSkillSessionsOpen(true)}>
              <Film className="h-3.5 w-3.5" />
              Skill Clips
            </Button>
            <Button variant="outline" onClick={() => setTrophyOpen(true)}>
              <Trophy className="h-3.5 w-3.5" />
              Trophies
            </Button>
            <Button variant="outline" onClick={() => setNutritionOpen(true)}>
              <Apple className="h-3.5 w-3.5" />
              Nutrition
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Communication &amp; Sharing
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button variant="outline" onClick={() => setChatOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              AI Chat
            </Button>
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive">
            Danger Zone
          </h3>
          <Card className="border-destructive/40">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">Remove from your roster</p>
                <p className="text-xs text-muted-foreground">
                  {athlete.name} reverts to Free Agent status. Their account and training history
                  stay intact.
                </p>
              </div>
              <Button variant="destructive" onClick={() => setRemoveOpen(true)}>
                <UserMinus className="h-3.5 w-3.5" />
                Remove
              </Button>
            </CardContent>
          </Card>
        </section>
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

      <BodyMetricsDialog
        open={metricsOpen}
        onOpenChange={setMetricsOpen}
        athleteName={athlete.name}
        fetchUrl={`/api/coach/roster/${athlete.id}/body-metrics`}
      />

      <TestingHistoryDialog
        open={testingOpen}
        onOpenChange={setTestingOpen}
        athleteName={athlete.name}
        fetchUrl={`/api/coach/roster/${athlete.id}/testing-history`}
      />

      <GoalsDialog
        open={goalsOpen}
        onOpenChange={setGoalsOpen}
        athleteName={athlete.name}
        goalsUrl={`/api/coach/roster/${athlete.id}/goals`}
        exercisesUrl={`/api/coach/analytics/exercises?athleteId=${athlete.id}`}
        skillExercisesUrl={`/api/coach/analytics/skill-exercises?athleteId=${athlete.id}`}
      />

      <SkillSessionsDialog
        open={skillSessionsOpen}
        onOpenChange={setSkillSessionsOpen}
        athleteName={athlete.name}
        athleteId={athlete.id}
      />

      <NutritionDialog
        open={nutritionOpen}
        onOpenChange={setNutritionOpen}
        athleteName={athlete.name}
        nutritionUrl={`/api/coach/roster/${athlete.id}/nutrition`}
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

      <TrophyCaseDialog
        open={trophyOpen}
        onOpenChange={setTrophyOpen}
        athleteName={athlete.name}
        fetchUrl={`/api/coach/roster/${athlete.id}/trophies`}
      />

      <ChatHistoryDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        athleteId={athlete.id}
        athleteName={athlete.name}
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
