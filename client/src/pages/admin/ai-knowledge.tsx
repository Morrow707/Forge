import { AppShell } from "@/components/app-shell";
import { AdminTeachChatPanel } from "@/components/admin-teach-chat-panel";

/** Lets the admin teach the AI program builder general programming
 * knowledge (exercise sequencing, fatigue management, etc.) through a
 * conversation, separate from editing any one program. Whatever's learned
 * here applies to every AI-generated program platform-wide -- see
 * storage.getAiKnowledgeGuidelines on the server. */
export default function AdminAiKnowledge() {
  return (
    <AppShell title="Teach the AI">
      <AdminTeachChatPanel
        fetchUrl="/api/admin/ai-knowledge"
        postUrl="/api/admin/ai-knowledge/chat"
        chatTitle="Teach the AI Program Builder"
        chatDescription="Describe programming principles, corrections, or preferences -- every AI-generated program on this platform (every coach and athlete) will follow them from now on."
        emptyStateHint={'Nothing taught yet -- try something like "Bulgarian split squats are a secondary lift on leg day, not a true accessory -- sequence them right after the main squat or deadlift."'}
        placeholder="Teach it something about how programs should be built..."
        guidelinesTitle="Current Guidelines"
        guidelinesDescription="The complete living document the AI follows right now, on top of its built-in programming rules."
        guidelinesEmptyHint="Nothing taught yet -- start a conversation to build this up."
      />
    </AppShell>
  );
}
