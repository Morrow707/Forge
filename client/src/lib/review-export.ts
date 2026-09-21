import { drawEvents } from "@/lib/review-draw";
import { visibleAt, speedAt, type ReviewEvent } from "@shared/video-review";

/**
 * Longest review that may be exported. The render runs in REAL TIME -- a three-minute review
 * takes three minutes with the phone awake and the tab in front -- so this is a limit on how
 * long somebody can be asked to wait, not on file size.
 */
export const MAX_EXPORT_SECONDS = 180;

/** What the caller must have on screen already: the videos are played, not re-decoded. */
export type ExportSources = {
  left: HTMLVideoElement;
  right?: HTMLVideoElement | null;
  /** The recorded voice-over, when there is one. Mixed into the output. */
  audio?: HTMLAudioElement | null;
  events: ReviewEvent[];
  /** Right-side time from left-side time, the review's own sync (see rightTimeForLeftTime). */
  rightTimeFor?: (leftT: number) => number;
  width?: number;
  height?: number;
};

/**
 * The media type the platform will actually produce.
 *
 * iOS Safari gives mp4 and refuses webm; Chrome is the other way round. Asking for the wrong
 * one does not error -- MediaRecorder silently falls back to its default and the caller ends up
 * uploading a file whose extension lies about its contents, which is exactly the kind of bug
 * that only shows up on somebody else's phone.
 */
export function pickExportMimeType(): string | null {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return null;
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export type ExportProgress = { seconds: number; total: number };

/**
 * BURN A REVIEW INTO A REAL VIDEO FILE (Phase 5 of docs/video-review-plan.md).
 *
 * Plays the review through a canvas and records the canvas. It is deliberately a REPLAY rather
 * than a re-render: the same drawEvents and the same visibleAt the player uses, driven by the
 * same clock, so an export cannot drift from what the coach watched when they saved it. A
 * second renderer that "produces the same thing" is a second renderer to keep in step, and it
 * would not stay in step.
 *
 * Real time is not an implementation detail either. captureStream records what a canvas
 * actually painted, and the videos decode at their own pace; running the clock faster produces
 * dropped frames rather than a faster export.
 */
export async function renderReviewToBlob(
  sources: ExportSources,
  onProgress?: (p: ExportProgress) => void,
): Promise<{ blob: Blob; mimeType: string }> {
  const mimeType = pickExportMimeType();
  if (!mimeType) throw new Error("This device can't record video from a canvas.");

  const { left, right, audio, events } = sources;
  const total = Math.min(left.duration || 0, MAX_EXPORT_SECONDS);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("This clip hasn't loaded yet — give it a moment and try again.");
  }

  const width = sources.width ?? left.videoWidth ?? 720;
  const height = sources.height ?? left.videoHeight ?? 1280;
  const canvas = document.createElement("canvas");
  // Two clips sit side by side, one fills the frame.
  canvas.width = right ? width * 2 : width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device can't render the export.");

  const stream = canvas.captureStream(30);
  // The voice-over is the review as much as the drawings are; an export without it would be
  // a silent film of somebody explaining something.
  if (audio) {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtor) {
      const actx = new AudioCtor();
      const dest = actx.createMediaElementSource(audio);
      const out = actx.createMediaStreamDestination();
      dest.connect(out);
      dest.connect(actx.destination);
      for (const track of out.stream.getAudioTracks()) stream.addTrack(track);
    }
  }

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const rightTimeFor = sources.rightTimeFor ?? ((t: number) => t);
  let raf = 0;
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  function paint() {
    const t = left.currentTime;
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    ctx!.drawImage(left, 0, 0, width, height);
    if (right) ctx!.drawImage(right, width, 0, width, height);

    const box = { width, height };
    drawEvents(ctx!, visibleAt(events, t, "left"), box, null);
    if (right) {
      ctx!.save();
      ctx!.translate(width, 0);
      drawEvents(ctx!, visibleAt(events, t, "right"), box, null);
      ctx!.restore();
    }
    onProgress?.({ seconds: t, total });
    raf = requestAnimationFrame(paint);
  }

  left.currentTime = 0;
  if (right) right.currentTime = rightTimeFor(0);
  if (audio) audio.currentTime = 0;
  left.playbackRate = speedAt(events, 0);
  if (right) right.playbackRate = left.playbackRate;

  recorder.start();
  raf = requestAnimationFrame(paint);
  await Promise.all([
    left.play(),
    right ? right.play() : Promise.resolve(),
    audio ? audio.play() : Promise.resolve(),
  ]);

  await new Promise<void>((resolve) => {
    const check = () => {
      if (left.ended || left.currentTime >= total) return resolve();
      window.setTimeout(check, 100);
    };
    check();
  });

  cancelAnimationFrame(raf);
  left.pause();
  right?.pause();
  audio?.pause();
  recorder.stop();
  await stopped;

  return { blob: new Blob(chunks, { type: mimeType }), mimeType };
}

/** The file name an export is offered under. mp4 or webm, matching what was actually recorded
 * -- an extension that lies about the contents is the bug this exists to avoid. */
export function exportFileName(title: string, mimeType: string): string {
  const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "review"}.${ext}`;
}
