import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Dumbbell, Plus, ArrowRight, ClipboardCheck } from "lucide-react";
import type { ExerciseWithOwnership } from "@/lib/exercise-types";

type PendingSubmission = { id: number };
type OpenReport = { id: number };

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: exercises = [] } = useQuery<ExerciseWithOwnership[]>({
    queryKey: ["/api/admin/exercises"],
  });
  const { data: submissions = [] } = useQuery<PendingSubmission[]>({
    queryKey: ["/api/admin/submissions"],
  });
  const { data: reports = [] } = useQuery<OpenReport[]>({
    queryKey: ["/api/admin/reports"],
  });

  const categoryCounts = exercises.reduce<Record<string, number>>((acc, ex) => {
    acc[ex.category] = (acc[ex.category] ?? 0) + 1;
    return acc;
  }, {});
  const pendingCount = submissions.length + reports.length;

  return (
    <AppShell title={`Welcome, ${user?.name?.split(" ")[0] ?? "Admin"}`}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-3xl font-bold">{exercises.length}</p>
              <p className="text-sm text-muted-foreground">Forge exercises</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-success/15 text-success">
              <ArrowRight className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-3xl font-bold">{Object.keys(categoryCounts).length}</p>
              <p className="text-sm text-muted-foreground">Categories covered</p>
            </div>
          </CardContent>
        </Card>
        <Link href="/admin/review">
          <Card className="cursor-pointer transition-colors hover:border-primary/50">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-3xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Awaiting review</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Forge Library</CardTitle>
            <CardDescription>
              Every exercise you create here shows up for every coach, branded FORGE, and can
              only be edited by you.
            </CardDescription>
          </div>
          <Link href="/admin/exercises/new">
            <Button>
              <Plus className="h-4 w-4" />
              New Exercise
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <Link href="/admin/exercises">
            <Button variant="outline" className="w-full">
              View Full Library
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </AppShell>
  );
}
