import { AppShell } from "@/components/app-shell";
import { CameraAiHistoryContent } from "./camera-ai-history";

/**
 * The camera AI's own page.
 *
 * It used to be a tab on Teach AI, where it was the only one that taught
 * nothing -- a history of past analyses is a record, not an input, and
 * filing it under "teach" made the page's purpose fuzzier for every other
 * tab on it.
 */
export default function AdminCameraAi() {
  return (
    <AppShell title="Camera AI">
      <CameraAiHistoryContent />
    </AppShell>
  );
}
