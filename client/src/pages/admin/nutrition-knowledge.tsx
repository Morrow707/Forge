import { AppShell } from "@/components/app-shell";
import { AdminTeachChatPanel } from "@/components/admin-teach-chat-panel";

/** Lets the admin teach the nutrition education AI (answerNutritionQuestion
 * on the server, the Free Agent "Ask about nutrition" feature) general
 * sports-nutrition guidance through a conversation -- typically relaying
 * what a real credentialed nutritionist/dietitian on the team wants it to
 * know. Whatever's learned here applies to every nutrition Q&A answer
 * platform-wide -- see storage.getNutritionKnowledgeGuidelines. The AI's
 * hard safety rules (no individualized numeric prescriptions, medical/
 * disordered-eating redirects) can never be taught away, regardless of
 * what's added here -- see the constraint spelled out in
 * updateNutritionKnowledgeFromChat's own system prompt on the server. */
export default function AdminNutritionKnowledge() {
  return (
    <AppShell title="Teach the Nutrition AI">
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
    </AppShell>
  );
}
