import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EntryPill, type CalendarEntry } from "@/components/calendar-view";
import { CoachDayEditDialog } from "@/components/coach-day-edit-dialog";
import { SkillDayViewDialog } from "@/components/skill-day-view-dialog";
import { CoachDigestBanner } from "@/components/coach-digest-banner";
import { ReengagementBanner } from "@/components/reengagement-banner";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import {
  Dumbbell,
  ListChecks,
  Users,
  ArrowRight,
  Copy,
  CalendarDays,
  Mail,
  QrCode,
  HeartPulse,
} from "lucide-react";
import { toast } from "sonner";
import { addDays, format, formatISO, isToday } from "date-fns";

type ProgramSummary = {
  id: number;
  name: string;
  description: string | null;
  weekCount: number;
  dayCount: number;
  assignedAthleteCount: number;
};

type RosterEntry = { id: number; name: string; email: string };
type ExerciseSummary = { id: number };
type TeamSummary = { id: number; name: string; code: string | null };

export default function CoachDashboard() {
  const { user } = useAuth();
  const { data: programs = [] } = useQuery<ProgramSummary[]>({
    queryKey: ["/api/coach/programs"],
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });
  const { data: exercises = [] } = useQuery<ExerciseSummary[]>({
    queryKey: ["/api/coach/exercises"],
  });
  const { data: teams = [] } = useQuery<TeamSummary[]>({
    queryKey: ["/api/coach/teams"],
  });
  const { data: wellnessToday = [] } = useQuery<{ level: "green" | "yellow" | "red" }[]>({
    queryKey: ["/api/coach/roster-wellness"],
  });
  const flaggedToday = wellnessToday.filter((w) => w.level === "red").length;

  const days = [0, 1, 2].map((offset) => addDays(new Date(), offset));
  const rangeStart = formatISO(days[0], { representation: "date" });
  const rangeEnd = formatISO(days[days.length - 1], { representation: "date" });

  const { data: upcoming = [] } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/coach/calendar", rangeStart, rangeEnd],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/calendar?start=${rangeStart}&end=${rangeEnd}`,
      );
      return res.json();
    },
  });

  const [editing, setEditing] = useState<{
    programDayId: number;
    assignmentId: number;
    athleteId: number;
    athleteName: string;
  } | null>(null);
  const [viewingSkill, setViewingSkill] = useState<{
    skillProgramId: number;
    skillProgramDayId: number;
    athleteName: string;
  } | null>(null);

  return (
    <AppShell title={`Welcome, ${user?.name?.split(" ")[0] ?? "Coach"}`} fitScreen>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <CoachDigestBanner />
        <ReengagementBanner />

        <Card className="shrink-0">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-3 md:p-4">
            <div>
              <CardTitle className="text-base md:text-lg">Next 3 Days</CardTitle>
              <CardDescription className="hidden sm:block">
                Quick look across your roster — synced with the full calendar.
              </CardDescription>
            </div>
            <Link href="/coach/calendar">
              <Button variant="outline" size="sm">
                Full Calendar
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-4 md:pt-0">
            <div className="grid gap-2.5 sm:grid-cols-3">
              {days.map((day) => {
                const dateStr = formatISO(day, { representation: "date" });
                const dayEntries = upcoming.filter((e) => e.date === dateStr);
                const shown = dayEntries.slice(0, 3);
                const overflow = dayEntries.length - shown.length;
                return (
                  <div key={dateStr} className="rounded-md border border-border p-2">
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span
                        className={cn(
                          "text-xs font-semibold uppercase text-muted-foreground",
                          isToday(day) && "text-primary",
                        )}
                      >
                        {isToday(day) ? "Today" : format(day, "EEEE")}
                      </span>
                      <span className={cn("text-sm font-bold", isToday(day) && "text-primary")}>
                        {format(day, "MMM d")}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {shown.length === 0 && (
                        <p className="flex items-center justify-center gap-1.5 py-2 text-center text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Nothing scheduled
                        </p>
                      )}
                      {shown.map((e) => (
                        <EntryPill
                          key={`${e.assignmentId}-${e.programDayId}`}
                          entry={e}
                          onClick={() =>
                            e.kind === "skill"
                              ? setViewingSkill({
                                  skillProgramId: e.programId,
                                  skillProgramDayId: e.programDayId,
                                  athleteName: e.athleteName!,
                                })
                              : setEditing({
                                  programDayId: e.programDayId,
                                  assignmentId: e.assignmentId,
                                  athleteId: e.athleteId!,
                                  athleteName: e.athleteName!,
                                })
                          }
                        />
                      ))}
                      {overflow > 0 && (
                        <Link href="/coach/calendar">
                          <span className="block px-1.5 text-[11px] font-semibold text-primary hover:underline">
                            +{overflow} more
                          </span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Athletes" value={roster.length} href="/coach/roster" />
          <StatCard
            icon={ListChecks}
            label="Programs"
            value={programs.length}
            href="/coach/programs"
          />
          <StatCard
            icon={Dumbbell}
            label="Exercises in bank"
            value={exercises.length}
            href="/coach/exercises"
          />
          <StatCard
            icon={HeartPulse}
            label="Flagged today"
            value={flaggedToday}
            href="/coach/roster"
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
          <Card className="flex min-h-0 flex-col lg:col-span-2">
            <CardHeader className="flex-row shrink-0 items-center justify-between space-y-0 p-3 md:p-4">
              <div>
                <CardTitle className="text-base md:text-lg">Recent Programs</CardTitle>
                <CardDescription className="hidden sm:block">
                  Your most recently created training blocks.
                </CardDescription>
              </div>
              <Link href="/coach/programs">
                <Button variant="outline" size="sm">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pt-0 md:p-4 md:pt-0">
              {programs.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No programs yet. Build your first one to start assigning workouts.
                </p>
              )}
              {programs.slice(0, 5).map((p) => (
                <Link key={p.id} href={`/coach/programs/${p.id}`}>
                  <div className="flex cursor-pointer items-center justify-between rounded-md border border-border p-2.5 transition-colors hover:bg-surface-elevated">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.weekCount} weeks · {p.dayCount} days · {p.assignedAthleteCount}{" "}
                        athlete{p.assignedAthleteCount === 1 ? "" : "s"} assigned
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </Link>
              ))}
              <Link href="/coach/programs">
                <Button variant="secondary" className="w-full">
                  + New Program
                </Button>
              </Link>
            </CardContent>
          </Card>

          <TeamInviteCard teams={teams} coachCode={user?.coachCode ?? null} />
        </div>
      </div>

      <CoachDayEditDialog
        programDayId={editing?.programDayId ?? null}
        assignmentId={editing?.assignmentId ?? null}
        athleteId={editing?.athleteId ?? null}
        athleteName={editing?.athleteName}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />

      {viewingSkill && (
        <SkillDayViewDialog
          open
          onOpenChange={(open) => !open && setViewingSkill(null)}
          athleteName={viewingSkill.athleteName}
          source={{
            kind: "coach",
            skillProgramId: viewingSkill.skillProgramId,
            skillProgramDayId: viewingSkill.skillProgramDayId,
          }}
        />
      )}
    </AppShell>
  );
}

function TeamInviteCard({
  teams,
  coachCode,
}: {
  teams: TeamSummary[];
  coachCode: string | null;
}) {
  const codeOptions = [
    ...(coachCode ? [{ label: "All teams (personal code)", code: coachCode }] : []),
    ...teams.filter((t) => t.code).map((t) => ({ label: t.name, code: t.code as string })),
  ];
  const [selectedCode, setSelectedCode] = useState("");
  const [emails, setEmails] = useState("");
  const [qrOption, setQrOption] = useState<{ label: string; code: string } | null>(null);
  const effectiveCode =
    codeOptions.find((opt) => opt.code === selectedCode)?.code ?? codeOptions[0]?.code ?? "";

  function sendInvite() {
    const recipients = emails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      toast.error("Add at least one email");
      return;
    }
    const subject = "Join our team on Forge";
    const body = `Hey! Join our training program on Forge:\n\n1. Sign up at ${window.location.origin}/signup\n2. Choose "Athlete" and enter this invite code: ${effectiveCode}\n\nSee you there!`;
    const mailto = `mailto:?bcc=${encodeURIComponent(recipients.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="shrink-0 p-3 md:p-4">
        <CardTitle className="text-base md:text-lg">Invite Athletes</CardTitle>
        <CardDescription className="hidden sm:block">
          Each team has its own code -- athletes who use it join that team automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 pt-0 md:p-4 md:pt-0">
        {codeOptions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create a team on the Roster page to get a shareable code.
          </p>
        )}
        {codeOptions.map((opt) => (
          <div
            key={opt.code}
            className="flex items-center justify-between rounded-md bg-surface-elevated px-3 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase text-muted-foreground">
                {opt.label}
              </p>
              <p className="font-display text-lg font-bold tracking-widest text-primary">
                {opt.code}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Show QR code for ${opt.label}`}
                onClick={() => setQrOption(opt)}
              >
                <QrCode className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Copy ${opt.label} code`}
                onClick={() => {
                  navigator.clipboard.writeText(opt.code);
                  toast.success("Code copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        {codeOptions.length > 0 && (
          <div className="space-y-2 border-t border-border pt-2">
            <Select value={effectiveCode} onValueChange={setSelectedCode}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Code to include" />
              </SelectTrigger>
              <SelectContent>
                {codeOptions.map((opt) => (
                  <SelectItem key={opt.code} value={opt.code}>
                    {opt.label} — {opt.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="athlete1@email.com, athlete2@email.com"
              className="min-h-12 text-sm"
            />
            <Button size="sm" className="w-full" onClick={sendInvite}>
              <Mail className="h-3.5 w-3.5" />
              Email Invite
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={qrOption !== null} onOpenChange={(open) => !open && setQrOption(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{qrOption?.label}</DialogTitle>
            <DialogDescription>
              Scan to sign up as an athlete with this code pre-filled.
            </DialogDescription>
          </DialogHeader>
          {qrOption && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="rounded-md bg-white p-3">
                <QRCodeSVG
                  value={`${window.location.origin}/signup?code=${qrOption.code}`}
                  size={200}
                />
              </div>
              <p className="font-display text-xl font-bold tracking-widest text-primary">
                {qrOption.code}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Dumbbell;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-3 md:p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold md:text-3xl">{value}</p>
            <p className="truncate text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
