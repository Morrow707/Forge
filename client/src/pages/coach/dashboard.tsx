import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EntryPill, type CalendarEntry } from "@/components/calendar-view";
import { CoachDayEditDialog } from "@/components/coach-day-edit-dialog";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Dumbbell, ListChecks, Users, ArrowRight, Copy, CalendarDays } from "lucide-react";
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

  return (
    <AppShell title={`Welcome, ${user?.name?.split(" ")[0] ?? "Coach"}`}>
      <div className="grid gap-4 sm:grid-cols-3">
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
          icon={Users}
          label="Athletes"
          value={roster.length}
          href="/coach/roster"
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Next 3 Days</CardTitle>
            <CardDescription>Quick look across your roster — synced with the full calendar.</CardDescription>
          </div>
          <Link href="/coach/calendar">
            <Button variant="outline" size="sm">
              Full Calendar
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {days.map((day) => {
              const dateStr = formatISO(day, { representation: "date" });
              const dayEntries = upcoming.filter((e) => e.date === dateStr);
              const shown = dayEntries.slice(0, 4);
              const overflow = dayEntries.length - shown.length;
              return (
                <div key={dateStr} className="rounded-md border border-border p-2.5">
                  <div className="mb-2 flex items-baseline justify-between">
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
                  <div className="space-y-1.5">
                    {shown.length === 0 && (
                      <p className="flex items-center justify-center gap-1.5 py-4 text-center text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Nothing scheduled
                      </p>
                    )}
                    {shown.map((e) => (
                      <EntryPill
                        key={`${e.assignmentId}-${e.programDayId}`}
                        entry={e}
                        onClick={() =>
                          setEditing({
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

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Recent Programs</CardTitle>
              <CardDescription>Your most recently created training blocks.</CardDescription>
            </div>
            <Link href="/coach/programs">
              <Button variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {programs.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No programs yet. Build your first one to start assigning workouts.
              </p>
            )}
            {programs.slice(0, 5).map((p) => (
              <Link key={p.id} href={`/coach/programs/${p.id}`}>
                <div className="flex cursor-pointer items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-surface-elevated">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.weekCount} weeks · {p.dayCount} days · {p.assignedAthleteCount}{" "}
                      athlete{p.assignedAthleteCount === 1 ? "" : "s"} assigned
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
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

        <Card>
          <CardHeader>
            <CardTitle>Invite Athletes</CardTitle>
            <CardDescription>Share your coach code so athletes can join your roster.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-md bg-surface-elevated p-4">
              <span className="font-display text-2xl font-bold tracking-widest text-primary">
                {user?.coachCode}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Copy coach code"
                onClick={() => {
                  if (user?.coachCode) {
                    navigator.clipboard.writeText(user.coachCode);
                    toast.success("Coach code copied");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Athletes enter this code at signup, or from their account, to link to you.
            </p>
          </CardContent>
        </Card>
      </div>

      <CoachDayEditDialog
        programDayId={editing?.programDayId ?? null}
        assignmentId={editing?.assignmentId ?? null}
        athleteId={editing?.athleteId ?? null}
        athleteName={editing?.athleteName}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </AppShell>
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
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-3xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
