import { useParams } from "wouter";
import { AppShell } from "@/components/app-shell";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { Card, CardContent } from "@/components/ui/card";
import {
  FREE_AGENT_ADD_ONS,
  isSportCoachAddOn,
  type FreeAgentAddOnId,
  type SportCoachAddOnId,
} from "@shared/free-agent-tiers";

// Each coach gets its own "no coach to loop in" framing -- unlike the
// general AI chat (which leans on "your coach can always read this"), a
// Free Agent using one of these has no coach at all (see requireFreeAgent),
// so pain/injury concerns get redirected to a real person instead.
// Keyed by SPORT COACH id, not by every add-on: this page is the coach chat, and an add-on
// that is not a coach has no "ask about your swing" line to give. See FreeAgentAddOnId.
const ADD_ON_DESCRIPTIONS: Record<SportCoachAddOnId, string> = {
  golf_swing:
    "Ask about your swing, short game, or putting. There's no coach on this platform to loop in here -- for pain or injury, talk to a doctor or a certified instructor in person.",
  hitting:
    "Ask about your hitting mechanics or approach. There's no coach on this platform to loop in here -- for pain or injury, talk to a doctor or a certified instructor in person.",
  pitching:
    "Ask about your pitching mechanics, arm care, or mound work. There's no coach on this platform to loop in here -- for pain or injury, talk to a doctor or a certified instructor in person.",
};

export default function AthleteSportCoach() {
  const { addOnId } = useParams<{ addOnId: string }>();
  // A NON-COACH ADD-ON IS NOT A 404 BY ACCIDENT HERE, IT IS ONE BY RULE. This route is the
  // sport-coach chat; video_analysis is a real add-on with no chat behind it, so landing here
  // with its id should read as "no such coach" rather than rendering a panel that posts to an
  // endpoint which will refuse it.
  const candidate = addOnId as FreeAgentAddOnId;
  const addOn = isSportCoachAddOn(candidate) ? FREE_AGENT_ADD_ONS[candidate] : undefined;

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
            description={ADD_ON_DESCRIPTIONS[addOn.id as SportCoachAddOnId]}
          />
        </div>
      </AppShell>
    </FreeAgentGate>
  );
}
