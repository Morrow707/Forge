import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarView, type CalendarEntry } from "@/components/calendar-view";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Dumbbell } from "lucide-react";

export default function AthleteDashboard() {
  const [, navigate] = useLocation();
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });

  const { data: entries = [], isLoading } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/athlete/calendar", range.start, range.end],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/athlete/calendar?start=${range.start}&end=${range.end}`,
      );
      return res.json();
    },
    enabled: Boolean(range.start && range.end),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });

  return (
    <AppShell title="My Calendar">
      <CalendarView
        entries={entries}
        onRangeChange={(start, end) => setRange({ start, end })}
        onEntryClick={(e) => navigate(`/athlete/day/${e.assignmentId}/${e.programDayId}/${e.date}`)}
      />

      {!isLoading && entries.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nothing on your calendar yet. Ask your coach to assign you a program.
            </p>
            <CoachJoinHint />
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function CoachJoinHint() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const { data: coaches = [] } = useQuery<{ id: number; name: string; coachCode: string }[]>({
    queryKey: ["/api/athlete/coaches"],
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/join-coach", { coachCode: code });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/coaches"] });
      toast.success(`Linked to ${data.coachName}`);
      setCode("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Invalid coach code"),
  });

  if (coaches.length > 0) {
    return (
      <Badge variant="secondary">
        Linked to coach {coaches.map((c) => c.name).join(", ")}
      </Badge>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) joinMutation.mutate();
      }}
      className="flex items-center gap-2"
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter coach code"
        className="h-9 w-40"
      />
      <Button type="submit" size="sm" disabled={joinMutation.isPending}>
        Join
      </Button>
    </form>
  );
}
