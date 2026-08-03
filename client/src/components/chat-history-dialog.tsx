import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiChatPanel } from "@/components/ai-chat-panel";

/** Read-only -- a coach can never post into an athlete's AI chat, only read
 * it. See AiChatPanel and the schema comment on athleteChatMessages for why
 * this view exists at all: the chat is never a private, unsupervised
 * channel between the athlete and the AI. */
export function ChatHistoryDialog({
  open,
  onOpenChange,
  athleteId,
  athleteName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteId: number | null;
  athleteName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-lg flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>{athleteName}'s AI Chat</DialogTitle>
        </DialogHeader>
        {athleteId != null && (
          <AiChatPanel
            fetchUrl={`/api/coach/roster/${athleteId}/chat`}
            athleteName={athleteName}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
