import { AppShell } from "@/components/app-shell";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { FreeAgentGate } from "@/components/free-agent-gate";

export default function AthleteChat() {
  return (
    <FreeAgentGate title="AI Training Chat">
      <AppShell title="AI Training Chat" fitScreen>
        <div className="flex min-h-0 flex-1 flex-col">
          <AiChatPanel fetchUrl="/api/athlete/chat" postUrl="/api/athlete/chat" />
        </div>
      </AppShell>
    </FreeAgentGate>
  );
}
