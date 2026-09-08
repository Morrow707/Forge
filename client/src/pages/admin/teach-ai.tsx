import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminTeachChatPanel } from "@/components/admin-teach-chat-panel";
import { ForgeAiContent } from "./forge-ai";
import { MovementKnowledgeContent } from "./movement-knowledge";
import { KnowledgeBaseContent } from "./knowledge-base";
import { cn } from "@/lib/utils";

/**
 * Everything that teaches the AI, on one page.
 *
 * WHY THIS SHRANK FROM SIX TABS TO THREE
 *
 * Program Builder and Nutrition were literally the same component -- one
 * AdminTeachChatPanel each, pointed at a different table. And Forge AI
 * already reaches both: a rule taught there is read by program drafting, the
 * nutrition assistant, form check, the digests and about twenty other
 * surfaces. Its own tool description says the category label "never
 * restricts which AI features see this".
 *
 * So three tabs offered three ways to teach the same kind of thing, and the
 * only real difference between them -- who ends up reading the rule -- was
 * implied by which tab you happened to open rather than stated anywhere.
 * That is the choice worth making visible, so it is now a selector with the
 * broadest option first and a line under each saying what it reaches.
 *
 * The three stores stay separate underneath. Merging them is a data
 * migration that would move guidance somebody deliberately scoped, and it is
 * not what making the choice legible requires.
 *
 * Movement stays its own tab because it is not prose at all -- numeric
 * tracking profiles, joint angles and thresholds per movement type.
 *
 * Camera AI left this page entirely. It is a history of past analyses: a
 * record, not an input, and the only tab here that taught nothing.
 */
export default function AdminTeachAi() {
  return (
    <AppShell title="Teach AI">
      <Tabs defaultValue="teach">
        <TabsList>
          <TabsTrigger value="teach">Teach</TabsTrigger>
          <TabsTrigger value="movement">Movement</TabsTrigger>
          <TabsTrigger value="documents">Books & Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="teach">
          <TeachPanel />
        </TabsContent>

        <TabsContent value="movement">
          <MovementKnowledgeContent />
        </TabsContent>

        <TabsContent value="documents">
          <KnowledgeBaseContent />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

/**
 * The three teaching scopes, broadest first.
 *
 * Order matters. "Every assistant" is the right default for almost anything
 * an admin wants to teach, and putting it first is what stops somebody
 * scoping a universal rule to the program builder because that tab happened
 * to be leftmost.
 */
const SCOPES = [
  {
    key: "everyone",
    label: "Every assistant",
    blurb:
      "Read by every AI surface in Forge -- program drafting, nutrition, form check, digests, the weakness report. Start here unless the rule genuinely only makes sense in one place.",
  },
  {
    key: "program-builder",
    label: "Program builder only",
    blurb:
      "Read only when the AI drafts a program. Use for sequencing, set and rep conventions, exercise selection -- guidance that would be noise in a nutrition answer.",
  },
  {
    key: "nutrition",
    label: "Nutrition only",
    blurb:
      "Read only by the nutrition assistant. Its safety rules always win: nothing taught here can turn it into individualized prescriptive advice.",
  },
] as const;

function TeachPanel() {
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("everyone");
  const active = SCOPES.find((s) => s.key === scope)!;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={scope === s.key}
              onClick={() => setScope(s.key)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                scope === s.key
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{active.blurb}</p>
      </div>

      {scope === "everyone" && <ForgeAiContent />}

      {scope === "program-builder" && (
        <AdminTeachChatPanel
          fetchUrl="/api/admin/ai-knowledge"
          postUrl="/api/admin/ai-knowledge/chat"
          applyUrl="/api/admin/ai-knowledge/apply"
          chatTitle="Teach the AI Program Builder"
          chatDescription="Describe programming principles, corrections, or preferences -- every AI-generated program on this platform (every coach and athlete) will follow them from now on."
          emptyStateHint={'Nothing taught yet -- try something like "Bulgarian split squats are a secondary lift on leg day, not a true accessory -- sequence them right after the main squat or deadlift."'}
          placeholder="Teach it something about how programs should be built..."
          guidelinesTitle="Current Guidelines"
          guidelinesDescription="The complete living document the AI follows right now, on top of its built-in programming rules."
          guidelinesEmptyHint="Nothing taught yet -- start a conversation to build this up."
        />
      )}

      {scope === "nutrition" && (
        <AdminTeachChatPanel
          fetchUrl="/api/admin/nutrition-knowledge"
          postUrl="/api/admin/nutrition-knowledge/chat"
          applyUrl="/api/admin/nutrition-knowledge/apply"
          chatTitle="Teach the Nutrition AI"
          chatDescription="Describe nutrition standards, corrections, or preferences -- every answer the nutrition education AI gives a Free Agent will follow them from now on. Its core safety rules (no individualized prescriptions, medical/disordered-eating redirects) always stay in place regardless of what's taught here."
          emptyStateHint={'Nothing taught yet -- try something like "For in-season team-sport athletes, emphasize same-day carb replenishment over strict daily totals."'}
          placeholder="Teach it something about sports nutrition..."
          guidelinesTitle="Current Guidelines"
          guidelinesDescription="The complete living document the nutrition AI follows right now, on top of its built-in ISSN/ACSM/AND/DC/IOC-grounded knowledge base."
          guidelinesEmptyHint="Nothing taught yet -- start a conversation to build this up."
        />
      )}
    </div>
  );
}
