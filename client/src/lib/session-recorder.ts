import { Capacitor, registerPlugin } from "@capacitor/core";

/** THE VIDEO WORKBENCH'S ONLY OUTPUT.
 *
 * A comparison session is not stored in Forge, so if the athlete does not record it, it did not
 * happen -- there is no cue list on a server and no player to re-perform it later. This records
 * the workbench itself: the scrubbing, the drawings, the skeleton toggles and the athlete's own
 * voice, into one ordinary movie file they then keep.
 *
 * See ios/App/App/AvSessionRecorderPlugin.swift for why the screen is the renderer rather than
 * a compositor, and for the cost of that choice (screen resolution, not source resolution).
 */
export interface SessionRecorderPlugin {
  isSupported(): Promise<{ supported: boolean; reason: string }>;
  start(options?: { microphone?: boolean }): Promise<void>;
  stop(): Promise<{ path: string; sizeBytes: number }>;
  discard(): Promise<void>;
  saveToPhotos(options: { path: string }): Promise<void>;
}

const SessionRecorder = registerPlugin<SessionRecorderPlugin>("AvSessionRecorder");

/** Native iOS only. The workbench itself works everywhere -- comparing, drawing and toggling
 * skeletons are all web -- and only the RECORDING needs the native layer, so a browser gets the
 * tool without the record button rather than a button that rejects. */
export function canRecordSession(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function sessionRecordingSupported(): Promise<{ supported: boolean; reason: string }> {
  if (!canRecordSession()) {
    return { supported: false, reason: "Recording a session is available in the iPhone app." };
  }
  try {
    return await SessionRecorder.isSupported();
  } catch {
    // A plugin that is not there at all reads the same as a device that cannot record: the
    // workbench stays usable, the record button does not appear.
    return { supported: false, reason: "Recording isn't available on this device." };
  }
}

export async function startSessionRecording(): Promise<void> {
  await SessionRecorder.start({ microphone: true });
}

export async function stopSessionRecording(): Promise<{ path: string; sizeBytes: number }> {
  return SessionRecorder.stop();
}

export async function discardSessionRecording(): Promise<void> {
  await SessionRecorder.discard().catch(() => {
    // Best effort. Failing to delete a temp file must never be what an athlete sees after a
    // session they were told is not stored anywhere.
  });
}

export async function saveSessionRecordingToPhotos(path: string): Promise<void> {
  await SessionRecorder.saveToPhotos({ path });
}
