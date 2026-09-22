import { useEffect, useState } from "react";
import { Circle, Download, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  discardSessionRecording,
  saveSessionRecordingToPhotos,
  sessionRecordingSupported,
  startSessionRecording,
  stopSessionRecording,
} from "@/lib/session-recorder";

/** THE ONLY THING THAT SURVIVES A WORKBENCH SESSION.
 *
 * Nothing here is stored in Forge -- not the comparison, not the drawings, not the voice-over.
 * Scott, 2026-09-22: "we won't be hosting it anyways, for them to save it they will have to
 * export it to their phone, so we don't store anything."
 *
 * Which means the athlete has to be TOLD that before they spend ten minutes on a session,
 * not after. The copy below is not decoration; it is the difference between a deliberate
 * choice and losing work.
 */
export function SessionRecorderControls() {
  const [support, setSupport] = useState<{ supported: boolean; reason: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [take, setTake] = useState<{ path: string; sizeBytes: number } | null>(null);

  useEffect(() => {
    void sessionRecordingSupported().then(setSupport);
  }, []);

  // Unknown is not "no": until the answer lands, nothing is drawn rather than a control that
  // might be about to disappear.
  if (!support) return null;
  if (!support.supported) {
    return <p className="text-[11px] text-white/50">{support.reason}</p>;
  }

  async function start() {
    setBusy(true);
    try {
      await startSessionRecording();
      setRecording(true);
      setTake(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start recording");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      const result = await stopSessionRecording();
      setRecording(false);
      setTake(result);
    } catch (err) {
      setRecording(false);
      toast.error(err instanceof Error ? err.message : "Couldn't finish the recording");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!take) return;
    setBusy(true);
    try {
      await saveSessionRecordingToPhotos(take.path);
      // Cleared only on success. A failed save that dropped the take would lose the session
      // outright, which is the one outcome this whole control exists to prevent.
      setTake(null);
      toast.success("Saved to your Photos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save to Photos");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    await discardSessionRecording();
    setTake(null);
  }

  if (take) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-white/70">
          Take ready -- {(take.sizeBytes / 1_000_000).toFixed(1)} MB. Save it to your phone or it
          is gone.
        </span>
        <Button size="sm" className="ml-auto" onClick={() => void save()} disabled={busy}>
          <Download className="h-3.5 w-3.5" /> Save to Photos
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void discard()} disabled={busy}>
          <Trash2 className="h-3.5 w-3.5" /> Discard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-white/50">
        {recording
          ? "Recording this session -- everything on screen, and your voice."
          : "Nothing here is saved to Forge. Record the session to keep it."}
      </span>
      {recording ? (
        <Button size="sm" variant="destructive" className="ml-auto" onClick={() => void stop()} disabled={busy}>
          <Square className="h-3.5 w-3.5" /> Stop
        </Button>
      ) : (
        <Button size="sm" className="ml-auto" onClick={() => void start()} disabled={busy}>
          <Circle className="h-3.5 w-3.5" /> Record
        </Button>
      )}
    </div>
  );
}
