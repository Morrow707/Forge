import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Dumbbell, Plus, ArrowRight } from "lucide-react";
import type { ExerciseWithOwnership } from "@/lib/exercise-types";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data: exercises = [] } = useQuery<ExerciseWithOwnership[]>({
    queryKey: ["/api/admin/exercises"],
  });

  const categoryCounts = exercises.reduce<Record<string, number>>((acc, ex) => {
    acc[ex.category] = (acc[ex.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell title={`Welcome, ${user?.name?.split(" ")[0] ?? "Admin"}`}>
      <div className="grid gap-4 sm:grid-cols-2">
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
