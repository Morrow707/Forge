import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Sparkles } from "lucide-react";

// Same reasoning as athlete/exercises.tsx -- a Free Agent works through the
// AI-built Skill Programs, not a standalone Skill Bank browse page.
export default function AthleteSkills() {
  return (
    <AppShell title="Skill Library">
      <Card className="mt-6">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="max-w-sm text-muted-foreground">
            Browsing the Skill Bank on your own isn't part of the AI-guided flow -- the AI builds
            and edits your skill program directly, and you can swap any drill it picks right from
            there.
          </p>
          <Button asChild>
            <Link href="/athlete/skill-programs">
              <Sparkles className="h-4 w-4" />
              Go to My Skill Programs
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
