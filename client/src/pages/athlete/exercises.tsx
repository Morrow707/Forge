import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";

// A Free Agent is guided entirely by the AI -- no standalone browsing of the
// raw Exercise Bank, just the AI-built Programs those exercises already live
// inside (exercise substitution still works from within a program, this is
// only the "browse everything on your own" destination). A coached athlete
// was already blocked from this route by the old FreeAgentGate (their nav
// doesn't even show Library); this now blocks a Free Agent the same way, so
// no athlete of either kind lands on a real Exercise Bank browse page.
export default function AthleteExercises() {
  return (
    <AppShell title="Exercise Library">
      <Card className="mt-6">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="max-w-sm text-muted-foreground">
            Browsing the Exercise Bank on your own isn't part of the AI-guided flow -- the AI
            builds and edits your program directly, and you can swap any exercise it picks right
            from there.
          </p>
          <Button asChild>
            <Link href="/athlete/programs">
              <Sparkles className="h-4 w-4" />
              Go to My Programs
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
