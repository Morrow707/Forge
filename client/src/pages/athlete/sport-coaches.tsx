import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FreeAgentGate } from "@/components/free-agent-gate";
import { useAuth } from "@/hooks/use-auth";
import { FREE_AGENT_ADD_ONS, FREE_AGENT_ADD_ON_ORDER } from "@shared/free-agent-tiers";
import { cn } from "@/lib/utils";
import { Sparkles, Unlock, Lock } from "lucide-react";

/** Picker for the three sport-specialist AI coaches -- each is its own paid
 * add-on (see shared/free-agent-tiers.ts), so unlike the general AI Chat nav
 * tab this needs to show what's actually owned before an athlete clicks in.
 * A locked card still navigates through -- the chat route's own 402 card
 * (see AiChatPanel) is the fallback for a stale render of this page's
 * unlocked state, not the primary way this gets communicated. */
export default function AthleteSportCoaches() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const owned = new Set(user?.isBetaAccount ? FREE_AGENT_ADD_ON_ORDER : user?.freeAgentAddOns ?? []);

  return (
    <FreeAgentGate title="Sport Coaches">
      <AppShell title="Sport Coaches">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FREE_AGENT_ADD_ON_ORDER.map((id) => {
            const addOn = FREE_AGENT_ADD_ONS[id];
            const isOwned = owned.has(id);
            return (
              // Only an owned coach is clickable. An unowned one navigated to the chat
              // and landed on the 402 lock card, which is a dead end dressed up as a
              // destination -- and there is no purchase path for these add-ons anywhere
              // in the app, so the price badge below went with it.
              <Card
                key={id}
                className={cn(
                  "flex flex-col transition-colors",
                  isOwned ? "cursor-pointer hover:border-primary/50" : "opacity-75",
                )}
                onClick={isOwned ? () => navigate(`/athlete/coach/${id}`) : undefined}
              >
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    {isOwned ? (
                      <Badge variant="success" className="shrink-0 gap-1 text-[10px]">
                        <Unlock className="h-2.5 w-2.5" />
                        UNLOCKED
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                        <Lock className="h-2.5 w-2.5" />
                        NOT IN YOUR PLAN
                      </Badge>
                    )}
                  </div>
                  <p className="font-display text-xl font-bold uppercase tracking-wide">{addOn.label}</p>
                  <p className="text-sm text-muted-foreground">{addOn.description}</p>
                  <Button
                    size="sm"
                    className="mt-auto w-full"
                    variant={isOwned ? "default" : "outline"}
                    disabled={!isOwned}
                  >
                    {isOwned ? "Open chat" : "Not in your plan"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </AppShell>
    </FreeAgentGate>
  );
}
