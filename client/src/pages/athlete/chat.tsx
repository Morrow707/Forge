import { AppShell } from "@/components/app-shell";
import { AiChatPanel } from "@/components/ai-chat-panel";
import { FreeAgentGate } from "@/components/free-agent-gate";

import { useT } from "@/i18n";
export default function AthleteChat() {
  const t = useT();
  return (
    <FreeAgentGate title={t("AI Training Chat")}>
      <AppShell title={t("AI Training Chat")} fitScreen>
        <div className="flex min-h-0 flex-1 flex-col">
          <AiChatPanel fetchUrl="/api/athlete/chat" postUrl="/api/athlete/chat" />
        </div>
      </AppShell>
    </FreeAgentGate>
  );
}
