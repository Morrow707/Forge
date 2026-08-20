import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Users, Trophy, ChevronDown, ChevronUp } from "lucide-react";

type LessonFunnelRow = { lessonNumber: number; title: string; started: number; passed: number };
type ClassAnalyticsRow = {
  id: number;
  name: string;
  isForgeOfficial: boolean;
  isDraft: boolean;
  lessonCount: number;
  enrolledCount: number;
  completedCount: number;
  completionRate: number;
  lessons: LessonFunnelRow[];
};
type ClassAnalytics = {
  totalClasses: number;
  totalEnrollments: number;
  totalCompletions: number;
  classes: ClassAnalyticsRow[];
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function ClassFunnelRow({ row }: { row: ClassAnalyticsRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{row.name}</span>
            {row.isDraft && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                DRAFT
              </Badge>
            )}
            {row.isForgeOfficial && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                FORGE
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.lessonCount} lesson{row.lessonCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {row.enrolledCount}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" />
            {row.enrolledCount > 0 ? pct(row.completionRate) : "–"}
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {row.enrolledCount === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">No enrollments yet.</p>
          ) : (
            <div className="space-y-1.5">
              {row.lessons.map((l) => {
                const startedPct = row.enrolledCount > 0 ? l.started / row.enrolledCount : 0;
                const passedPct = row.enrolledCount > 0 ? l.passed / row.enrolledCount : 0;
                return (
                  <div key={l.lessonNumber} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 truncate text-muted-foreground">
                      L{l.lessonNumber}: {l.title}
                    </span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-secondary">
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/25"
                        style={{ width: `${startedPct * 100}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-primary"
                        style={{ width: `${passedPct * 100}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-muted-foreground">
                      {l.started} read / {l.passed} passed
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Lighter bar = read the content, solid bar = passed the quiz -- out of{" "}
                {row.enrolledCount} enrolled.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminClassesAnalytics() {
  const { data, isLoading } = useQuery<ClassAnalytics>({
    queryKey: ["/api/admin/classes/analytics"],
  });

  return (
    <AppShell title="Class Analytics">
      <div className="space-y-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

        {data && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-3xl font-bold">{data.totalClasses}</p>
                    <p className="text-sm text-muted-foreground">Classes on the platform</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-3xl font-bold">{data.totalEnrollments}</p>
                    <p className="text-sm text-muted-foreground">Total enrollments</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-3xl font-bold">
                      {data.totalEnrollments > 0
                        ? pct(data.totalCompletions / data.totalEnrollments)
                        : "–"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Overall completion rate ({data.totalCompletions} finished)
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Per-Class Enrollment &amp; Drop-off</CardTitle>
                <CardDescription>
                  Every class on Forge, Forge-official and coach-authored alike. Expand a class to
                  see where athletes stall lesson by lesson.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.classes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No classes have been created yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.classes.map((row) => (
                      <ClassFunnelRow key={row.id} row={row} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
