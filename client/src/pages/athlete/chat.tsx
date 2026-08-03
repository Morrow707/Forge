import { AppShell } from "@/components/app-shell";
import { AiChatPanel } from "@/components/ai-chat-panel";

export default function AthleteChat() {
  return (
    <AppShell title="AI Training Chat" fitScreen>
      <div className="flex min-h-0 flex-1 flex-col">
        <AiChatPanel fetchUrl="/api/athlete/chat" postUrl="/api/athlete/chat" />
      </div>
    </AppShell>
  );
}
