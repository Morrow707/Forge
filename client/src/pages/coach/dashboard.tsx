import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Dumbbell, ListChecks, Users, ArrowRight, Copy } from "lucide-react";
import { toast } from "sonner";

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
