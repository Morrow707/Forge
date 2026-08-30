import { useParams } from "wouter";
import { AppShell } from "@/components/app-shell";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { Card, CardContent } from "@/components/ui/card";
import { FREE_AGENT_ADD_ONS, type FreeAgentAddOnId } from "@shared/free-agent-tiers";

// Each coach gets its own "no coach to loop in" framing -- unlike the
// general AI chat (which leans on "your coach can always read this"), a
// Free Agent using one of these has no coach at all (see requireFreeAgent),
// so pain/injury concerns get redirected to a real person instead.
const ADD_ON_DESCRIPTIONS: Record<FreeAgentAddOnId, string> = {
  golf_swing:
    "Ask about your swing, short game, or putting. There's no coach on this platform to loop in here -- for pain or injury, talk to a doctor or a certified instructor in person.",
  hitting:
    "Ask about your hitting mechanics or approach. There's no coach on this platform to loop in here -- for pain or injury, talk to a doctor or a certified instructor in person.",
  pitching:
    "Ask about your pitching mechanics, arm care, or mound work. There's no coach on this platform to loop in here -- for pain or injury, talk to a doctor or a certified instructor in person.",
};

export default function AthleteSportCoach() {
  const { addOnId } = useParams<{ addOnId: string }>();
  const addOn = FREE_AGENT_ADD_ONS[addOnId as FreeAgentAddOnId];

  if (!addOn) {
    return (
      <AppShell title="Sport Coach">
        <Card className="mt-6">
          <CardContent className="py-14 text-center text-muted-foreground">
            No such sport coach.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <FreeAgentGate title={addOn.label}>
      <AppShell title={addOn.label} fitScreen>
        <div className="flex min-h-0 flex-1 flex-col">
          <AiChatPanel
            fetchUrl={`/api/athlete/coach/${addOn.id}/chat`}
            postUrl={`/api/athlete/coach/${addOn.id}/chat`}
            title={addOn.label}
            description={ADD_ON_DESCRIPTIONS[addOn.id]}
          />
        </div>
      </AppShell>
    </FreeAgentGate>
  );
}
