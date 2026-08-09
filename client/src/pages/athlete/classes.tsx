import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, ListOrdered, ArrowRight } from "lucide-react";

type EnrolledClass = {
  classId: number;
  name: string;
  description: string | null;
  isForgeOfficial: boolean;
  lessonCount: number;
  lessonsStarted: number;
};

type BrowsableClass = {
  id: number;
  name: string;
  description: string | null;
  lessonCount: number;
  isForgeOfficial: true;
  ownerLabel: string;
};

/** Classes -- "My Classes" (enrolled, works for any athlete regardless of
 * having a coach) plus, only for a Free Agent, a Forge catalog to browse
 * and self-enroll into. A coached athlete only ever sees what their coach
 * put them in, same as programs/skill programs -- there's no self-service
 * browsing for them here. */
export default function AthleteClasses() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: coaches, isLoading: coachesLoading } = useQuery<{ id: number }[]>({
    queryKey: ["/api/athlete/coaches"],
  });
  const isFreeAgent = !!coaches && coaches.length === 0;

  const { data: myClasses = [], isLoading: myLoading } = useQuery<EnrolledClass[]>({
    queryKey: ["/api/athlete/my-classes"],
  });
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<BrowsableClass[]>({
    queryKey: ["/api/athlete/classes"],
    enabled: isFreeAgent,
  });

  const enrolledIds = new Set(myClasses.map((c) => c.classId));
  const [enrollTarget, setEnrollTarget] = useState<BrowsableClass | null>(null);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!enrollTarget) return;
      const res = await apiRequest("POST", `/api/athlete/classes/${enrollTarget.id}/enroll`, {
        startDate,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/my-classes"] });
      toast.success("Enrolled — lesson 1 is on your calendar");
      setEnrollTarget(null);
      if (enrollTarget) navigate(`/athlete/classes/${enrollTarget.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not enroll"),
  });

  return (
    <AppShell title="Classes">
      <div className="space-y-8">
        <div>
          <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide text-muted-foreground">
            My Classes
          </h2>
          {!myLoading && myClasses.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <GraduationCap className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {isFreeAgent
                    ? "Nothing here yet -- browse Forge Classes below to get started."
                    : "Your coach hasn't enrolled you in a Class yet."}
                </p>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myClasses.map((c) => (
              <Card
                key={c.classId}
                className="flex cursor-pointer flex-col transition-colors hover:border-primary/50"
                onClick={() => navigate(`/athlete/classes/${c.classId}`)}
              >
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <p className="font-display text-xl font-bold uppercase tracking-wide">{c.name}</p>
                  {c.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ListOrdered className="h-3.5 w-3.5" />
                      Lesson {Math.min(c.lessonsStarted, c.lessonCount) || 1} of {c.lessonCount}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {!coachesLoading && isFreeAgent && (
          <div>
            <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide text-muted-foreground">
              Browse Forge Classes
            </h2>
            {!catalogLoading && catalog.length === 0 && (
              <p className="text-sm text-muted-foreground">No Forge Classes published yet.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog
                .filter((c) => !enrolledIds.has(c.id))
                .map((c) => (
                  <Card key={c.id} className="flex flex-col">
                    <CardContent className="flex flex-1 flex-col gap-3 p-5">
                      <p className="font-display text-xl font-bold uppercase tracking-wide">{c.name}</p>
                      {c.description && (
                        <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                      )}
                      <div className="mt-auto space-y-2">
                        <div className="flex items-center border-t border-border pt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ListOrdered className="h-3.5 w-3.5" />
                            {c.lessonCount} lesson{c.lessonCount === 1 ? "" : "s"}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setStartDate(new Date().toISOString().slice(0, 10));
                            setEnrollTarget(c);
                          }}
                        >
                          Enroll
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={enrollTarget !== null} onOpenChange={(open) => !open && setEnrollTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll in {enrollTarget?.name}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enrollMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="class-enroll-date">Start date</Label>
              <Input
                id="class-enroll-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Lesson 1 lands on your calendar this day.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEnrollTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={enrollMutation.isPending}>
                {enrollMutation.isPending ? "Enrolling…" : "Enroll"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
