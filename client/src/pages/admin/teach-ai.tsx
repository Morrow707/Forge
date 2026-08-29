import { AppShell } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminTeachChatPanel } from "@/components/admin-teach-chat-panel";
import { ForgeAiContent } from "./forge-ai";
import { MovementKnowledgeContent } from "./movement-knowledge";

/** One page for every "teach the AI something" surface -- previously four
 * separate nav entries (Teach AI, Forge AI, Teach Nutrition AI, Teach
 * Movement AI), each its own full page. They're unrelated features (a
 * program-builder guidelines document, Forge AI's per-entry propose flow,
 * a nutrition guidelines document, per-movement-type kinematic profiles)
 * sharing only the fact that an admin teaches them through a chat -- kept
 * fully separate as tabs, not merged into one form, just no longer four
 * separate menu items to find. */
export default function AdminTeachAi() {
  return (
    <AppShell title="Teach AI">
      <Tabs defaultValue="program-builder">
        <TabsList>
          <TabsTrigger value="program-builder">Program Builder</TabsTrigger>
          <TabsTrigger value="forge-ai">Forge AI</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
          <TabsTrigger value="movement">Movement</TabsTrigger>
        </TabsList>

        <TabsContent value="program-builder">
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
        </TabsContent>

        <TabsContent value="forge-ai">
          <ForgeAiContent />
        </TabsContent>

        <TabsContent value="nutrition">
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
        </TabsContent>

        <TabsContent value="movement">
          <MovementKnowledgeContent />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
