import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatISO,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, CheckCircle2, Dumbbell, MoonStar } from "lucide-react";
import { cn } from "@/lib/utils";

type CalendarEntry = {
  date: string;
  assignmentId: number;
  programDayId: number;
  programId: number;
  programName: string;
  title: string;
  isRestDay: boolean;
  exerciseCount: number;
  completed: boolean;
};

export default function AthleteDashboard() {
  const [, navigate] = useLocation();
  const [cursor, setCursor] = useState(() => new Date());

  const rangeStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });

  const startStr = formatISO(rangeStart, { representation: "date" });
  const endStr = formatISO(rangeEnd, { representation: "date" });

  const { data: entries = [], isLoading } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/athlete/calendar", startStr, endStr],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/athlete/calendar?start=${startStr}&end=${endStr}`,
      );
      return res.json();
    },
  });

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [entries]);

  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  return (
    <AppShell
      title="My Calendar"
      actions={
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setCursor((c) => subMonths(c, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-32 text-center font-display text-lg font-bold uppercase">
            {format(cursor, "MMMM yyyy")}
          </span>
          <Button size="icon" variant="outline" onClick={() => setCursor((c) => addMonths(c, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-muted-foreground sm:gap-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((day) => {
          const dateStr = formatISO(day, { representation: "date" });
          const dayEntries = entriesByDate.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, cursor);

          return (
            <div
              key={dateStr}
              className={cn(
                "flex min-h-24 flex-col gap-1 rounded-md border border-border p-1.5 sm:min-h-28 sm:p-2",
                !inMonth && "opacity-30",
                isToday(day) && "border-primary",
              )}
            >
              <span className={cn("text-xs font-semibold", isToday(day) && "text-primary")}>
                {format(day, "d")}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                {dayEntries.map((e) => (
                  <button
                    key={`${e.assignmentId}-${e.programDayId}`}
                    onClick={() =>
                      navigate(`/athlete/day/${e.assignmentId}/${e.programDayId}/${e.date}`)
                    }
                    className={cn(
                      "flex items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[11px] font-semibold transition-colors sm:text-xs",
                      e.isRestDay
                        ? "bg-secondary text-muted-foreground"
                        : e.completed
                          ? "bg-success/20 text-success"
                          : "bg-primary/20 text-primary hover:bg-primary/30",
                    )}
                  >
                    {e.isRestDay ? (
                      <MoonStar className="h-3 w-3 shrink-0" />
                    ) : e.completed ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                    ) : (
                      <Dumbbell className="h-3 w-3 shrink-0" />
                    )}
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

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
