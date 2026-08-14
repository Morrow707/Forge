import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/queryClient";
import {
  Circle,
  Square,
  RotateCcw,
  Upload,
  AlertTriangle,
  X,
  FolderOpen,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";
import { lockCameraExposure } from "@/lib/camera-exposure";

const MAX_SECONDS = 10;

type Mode = "record" | "upload";
type Step = "capture" | "trim" | "preview" | "uploading";

// Re-encodes a [start, end] window of a source video into a fresh clip by
// playing it into a captureStream() + MediaRecorder -- there's no server-side
// video toolchain here, so this is what lets an athlete upload a longer clip
// and only keep the 10-second window they scrubbed to. Requires
// HTMLVideoElement.captureStream, which every mainstream mobile/desktop
// browser has supported for several years.
async function trimClip(sourceUrl: string, start: number, end: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const src = document.createElement("video");
    src.src = sourceUrl;
    src.muted = true;
    src.playsInline = true;

    const capture = (src as any).captureStream ?? (src as any).mozCaptureStream;
    if (!capture) {
      reject(new Error("This browser can't trim video -- pick a clip 10s or shorter."));
      return;
    }

    src.addEventListener("loadedmetadata", () => {
      src.currentTime = start;
    });
    src.addEventListener(
      "seeked",
      () => {
        const stream: MediaStream = capture.call(src);
        const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = () => resolve(new Blob(chunks, { type: recordedVideoType(recorder, mimeType) }));
        recorder.onerror = () => reject(new Error("Trim failed -- try again."));
        recorder.start();
        src.play().catch(() => {});
        window.setTimeout(
          () => {
            src.pause();
            recorder.stop();
          },
          Math.max(200, (end - start) * 1000),
        );
      },
      { once: true },
    );
    src.addEventListener("error", () => reject(new Error("Could not load that video file.")));
  });
}

// Full-screen video capture: record on-device or upload an existing clip,
// trimmed to 10 seconds max. Nothing is uploaded to the server until the
// athlete explicitly taps Save -- a discarded or abandoned clip never
// leaves the browser.
export function FormVideoRecorderDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (url: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubVideoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<Mode>("record");
  const [step, setStep] = useState<Step>("capture");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  // Upload + trim state
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimming, setTrimming] = useState(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function resetAll() {
    setStep("capture");
    setCameraError(null);
    setRecording(false);
    setElapsed(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(null);
    setSourceDuration(0);
    setTrimStart(0);
    chunksRef.current = [];
  }

  useEffect(() => {
    if (!open) return;
    setMode("record");
    resetAll();
    return () => {
      stopCamera();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "record" || step !== "capture") {
      stopCamera();
      return;
    }
    // Video-only -- requesting a mic track here silently interrupts (and
    // doesn't resume) whatever background music the athlete had playing on
    // iOS, the same WebKit audio-session behavior that forced the camera
    // tracker's jump-landing-audio feature to be dropped entirely (see
    // bar-tracker-dialog.tsx's own comment on this). A form-check video
    // losing its own audio track costs less than muting music on every
    // single recording.
    //
    // ideal, not exact -- see bar-tracker-dialog.tsx's own comment on this
    // same constraint shape. This recorder has no live math riding on frame
    // rate (it's a plain saved clip for a coach to watch back later, not a
    // tracked set), but a smoother capture still makes a fast movement less
    // of a blur when scrubbing the review, for the same reasons.
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 30 },
        },
      })
      .then((stream) => {
        // The athlete can switch to Upload mode (or close the dialog)
        // before this permission prompt resolves -- without this guard, a
        // late-arriving stream would still get attached and left running,
        // orphaned, with nothing left to ever stop it until the next mode
        // switch or dialog close.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        // Best-effort, Chrome/Android-only -- see lockCameraExposure's own
        // comment. Same "less blur on a fast movement" reasoning as the
        // frameRate constraint above.
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) void lockCameraExposure(videoTrack);
      })
      .catch(() => setCameraError("Camera access denied or unavailable."));
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, step]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    resetAll();
    setMode(next);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const recordedBlob = new Blob(chunksRef.current, { type: recordedVideoType(recorder, mimeType) });
      setBlob(recordedBlob);
      setPreviewUrl(URL.createObjectURL(recordedBlob));
      setStep("preview");
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = window.setInterval(() => {
      setElapsed((s) => {
        if (s + 1 >= MAX_SECONDS) stopRecording();
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  }

  function handleFileChosen(file: File) {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    probe.onloadedmetadata = () => {
      const duration = probe.duration;
      if (duration <= MAX_SECONDS) {
        setBlob(file);
        setPreviewUrl(url);
        setStep("preview");
      } else {
        setSourceUrl(url);
        setSourceDuration(duration);
        setTrimStart(0);
        setStep("trim");
      }
    };
    probe.onerror = () => {
      toast.error("Could not read that video file.");
      URL.revokeObjectURL(url);
    };
  }

  async function confirmTrim() {
    if (!sourceUrl) return;
    setTrimming(true);
    try {
      const end = Math.min(trimStart + MAX_SECONDS, sourceDuration);
      const trimmed = await trimClip(sourceUrl, trimStart, end);
      setBlob(trimmed);
      setPreviewUrl(URL.createObjectURL(trimmed));
      setStep("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not trim that video.");
    } finally {
      setTrimming(false);
    }
  }

  function retake() {
    resetAll();
  }

  async function save() {
    if (!blob) return;
    setStep("uploading");
    try {
      const formData = new FormData();
      formData.append("video", blob, videoFilenameForBlob(blob, "form-check"));
      const res = await apiRequest("POST", "/api/athlete/form-video", formData);
      const { url } = await res.json();
      onSaved(url);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed — try again");
      setStep("preview");
    }
  }

  const windowEnd = Math.min(trimStart + MAX_SECONDS, sourceDuration);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black p-0 overflow-hidden [&>button]:hidden">
        <div className="relative flex h-full w-full flex-col">
          {/* Video / capture surface fills the screen */}
          <div className="relative flex-1 bg-black">
            {step === "preview" && previewUrl ? (
              <video src={previewUrl} controls playsInline className="h-full w-full object-contain" />
            ) : step === "trim" && sourceUrl ? (
              <video
                ref={scrubVideoRef}
                src={sourceUrl}
                playsInline
                muted
                className="h-full w-full object-contain"
              />
            ) : mode === "record" ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <FolderOpen className="h-12 w-12 text-white/60" />
                <p className="max-w-xs text-sm text-white/70">
                  Choose a video from your device. Anything over {MAX_SECONDS}s gets trimmed down
                  before it's saved.
                </p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Choose Video
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileChosen(file);
                    e.target.value = "";
                  }}
                />
              </div>
            )}

            {/* See-through overlay controls float on top of the video itself
                instead of living in an opaque footer bar below it. */}
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            {step === "capture" && (
              <div className="absolute left-3 top-3 flex gap-1 rounded-full bg-black/50 p-1 backdrop-blur-sm">
                {(["record", "upload"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                      mode === m ? "bg-white text-black" : "text-white/80 hover:text-white",
                    )}
                  >
                    {m === "record" ? "Record" : "Upload"}
                  </button>
                ))}
              </div>
            )}

            {mode === "record" && step === "capture" && recording && (
              <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                {elapsed}s / {MAX_SECONDS}s
              </div>
            )}

            {cameraError && mode === "record" && step === "capture" && (
              <div className="absolute inset-x-4 top-16 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white backdrop-blur-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {cameraError}
              </div>
            )}

            {step === "trim" && (
              <div className="absolute inset-x-3 bottom-3 space-y-2 rounded-lg bg-black/60 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                  <Scissors className="h-3.5 w-3.5" />
                  {sourceDuration.toFixed(1)}s clip — drag to pick your {MAX_SECONDS}s
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, sourceDuration - MAX_SECONDS)}
                  step={0.1}
                  value={trimStart}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setTrimStart(value);
                    if (scrubVideoRef.current) scrubVideoRef.current.currentTime = value;
                  }}
                  className="w-full accent-primary"
                />
                <p className="text-xs text-white/70">
                  {trimStart.toFixed(1)}s – {windowEnd.toFixed(1)}s
                </p>
              </div>
            )}
          </div>

          {/* Bottom action bar -- still see-through so the frame behind it
              stays visible, unlike a solid dialog footer. */}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
            {mode === "record" && step === "capture" && !recording && (
              <Button size="lg" onClick={startRecording} disabled={!!cameraError}>
                <Circle className="h-4 w-4 fill-current" />
                Start Recording
              </Button>
            )}
            {mode === "record" && step === "capture" && recording && (
              <Button size="lg" variant="secondary" onClick={stopRecording}>
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}
            {step === "trim" && (
              <>
                <Button variant="outline" onClick={retake}>
                  <RotateCcw className="h-4 w-4" />
                  New Video
                </Button>
                <Button onClick={confirmTrim} disabled={trimming}>
                  <Scissors className="h-4 w-4" />
                  {trimming ? "Trimming…" : "Use This Clip"}
                </Button>
              </>
            )}
            {step === "preview" && (
              <>
                <Button variant="outline" onClick={retake}>
                  <RotateCcw className="h-4 w-4" />
                  {mode === "record" ? "Retake" : "New Video"}
                </Button>
                <Button onClick={save}>
                  <Upload className="h-4 w-4" />
                  Save
                </Button>
              </>
            )}
            {step === "uploading" && (
              <Button disabled>
                <Upload className="h-4 w-4 animate-pulse" />
                Saving…
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
