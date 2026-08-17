import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError, uploadWithProgress } from "@/lib/queryClient";
import { Circle, Square, RotateCcw, Upload, AlertTriangle, X, Ruler } from "lucide-react";
import { toast } from "sonner";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { ensureCameraPermission, onAppForeground, onAppBackground } from "@/lib/native-camera";
import { isArMeasureSupported, measureWithAR } from "@/lib/ar-measure";

// Live recording has no fixed duration -- a set is as long as it takes
// (a slow tempo squat or a higher-rep set both run well past what a fixed
// countdown assumed), so this is a generous safety ceiling only, not a
// target: purely to stop an accidentally-left-running recording from
// growing unbounded in memory (MediaRecorder buffers the whole clip in
// memory until stop() is called), never something a real set should hit.
const RECORDING_SAFETY_CAP_SECONDS = 180;

type Step = "capture" | "preview" | "uploading";

// Full-screen video capture: record on-device only -- no picking an
// existing clip from the library, an athlete's form-check video is always
// filmed fresh in the moment. Nothing is uploaded to the server until the
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
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [step, setStep] = useState<Step>("capture");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // LiDAR-only (see ar-measure.ts) -- most devices this runs on won't have
  // it, so this starts false and only flips on after the async capability
  // check resolves, rather than showing a button that's about to disappear.
  const [arMeasureSupported, setArMeasureSupported] = useState(false);
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    if (!open) return;
    isArMeasureSupported().then(setArMeasureSupported);
  }, [open]);

  async function handleMeasure() {
    setMeasuring(true);
    try {
      const result = await measureWithAR();
      if (result) {
        // Not every AR measurement is the athlete's height -- this could
        // just as easily be a rack upright or a plate -- so this offers
        // saving it rather than assuming, same explicit-opt-in pattern
        // sprint-tracker-dialog.tsx uses for its own "save to testing
        // profile" action. user.heightIn already feeds real tracking math
        // (see bar-tracker-dialog.tsx's heightScaledAmplitudeCm), so this
        // isn't just a number sitting in a profile field -- it improves
        // rep/jump-amplitude thresholds for every future tracked set.
        const heightIn = Math.round(result.feet * 12 + result.inches);
        toast.success(`Measured: ${result.feet}' ${result.inches.toFixed(1)}" (${result.meters.toFixed(2)} m)`, {
          action: {
            label: "Save as height",
            onClick: () => {
              apiRequest("PATCH", "/api/athlete/profile", { heightIn })
                .then(() => toast.success("Height updated"))
                .catch((err) => toast.error(err instanceof Error ? err.message : "Could not save height"));
            },
          },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AR measurement failed.");
    } finally {
      setMeasuring(false);
    }
  }

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
    chunksRef.current = [];
  }

  useEffect(() => {
    if (!open) return;
    resetAll();
    return () => {
      stopCamera();
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || step !== "capture") {
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
    // Recorded in portrait -- the athlete is filming themselves standing in
    // front of the phone, virtually always held upright, and requesting a
    // landscape-shaped ideal here (as this used to) meant the encoded clip's
    // own intrinsic dimensions didn't match how it was actually framed,
    // which is what caused the video to render squished/sideways in some
    // playback contexts downstream (see video-analysis-dialog.tsx and
    // set-video-review.tsx). ideal, not exact -- see bar-tracker-dialog.tsx's
    // own comment on this same constraint shape.
    let cancelled = false;
    const acquireCamera = () => {
      ensureCameraPermission().then((granted) => {
        if (cancelled) return;
        if (!granted) {
          setCameraError("Camera access denied -- enable it for Forge in Settings.");
          return;
        }
        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 720 },
              height: { ideal: 1280 },
              frameRate: { ideal: 60, min: 30 },
            },
          })
          .then((stream) => {
            // The athlete can close the dialog before this permission prompt
            // resolves -- without this guard, a late-arriving stream would
            // still get attached and left running, orphaned, with nothing
            // left to ever stop it until the next dialog close.
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            setCameraError(null);
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            // Best-effort, Chrome/Android-only -- see lockCameraExposure's own
            // comment. Same "less blur on a fast movement" reasoning as the
            // frameRate constraint above.
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) void lockCameraExposure(videoTrack);
          })
          .catch(() => setCameraError("Camera access denied or unavailable."));
      });
    };
    acquireCamera();

    // See bar-tracker-dialog.tsx's own comment on onAppForeground.
    const unsubscribeForeground = onAppForeground(() => {
      const stillLive = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
      if (stillLive) return;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      acquireCamera();
    });
    // See bar-tracker-dialog.tsx's own comment on onAppBackground.
    const unsubscribeBackground = onAppBackground(() => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopCamera();
    });
    return () => {
      cancelled = true;
      unsubscribeForeground();
      unsubscribeBackground();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

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
        if (s + 1 >= RECORDING_SAFETY_CAP_SECONDS) stopRecording();
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  }

  function retake() {
    resetAll();
  }

  async function save() {
    if (!blob) return;
    setStep("uploading");
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("video", blob, videoFilenameForBlob(blob, "form-check"));
      const { url } = await uploadWithProgress("/api/athlete/form-video", formData, setUploadProgress);
      onSaved(url);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed — try again");
      setStep("preview");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black p-0 overflow-hidden [&>button]:hidden">
        <div className="relative flex h-full w-full flex-col">
          {/* Video / capture surface fills the screen */}
          <div className="relative flex-1 bg-black">
            {step === "preview" && previewUrl ? (
              <video src={previewUrl} controls playsInline className="h-full w-full object-contain" />
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
            )}

            {/* See-through overlay controls float on top of the video itself
                instead of living in an opaque footer bar below it. Pinned
                below env(safe-area-inset-top) (not a flat top-3) since a
                full-bleed layout puts these right where the notch/Dynamic
                Island otherwise sits -- the same fix applied to the other
                full-screen video dialogs. */}
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            {step === "capture" && recording && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                {elapsed}s
              </div>
            )}

            {cameraError && step === "capture" && (
              <div className="absolute inset-x-4 top-[calc(max(0.75rem,env(safe-area-inset-top))_+_3.25rem)] flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white backdrop-blur-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {cameraError}
              </div>
            )}
          </div>

          {/* Bottom action bar -- still see-through so the frame behind it
              stays visible, unlike a solid dialog footer. */}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
            {step === "capture" && !recording && (
              <Button size="lg" onClick={startRecording} disabled={!!cameraError}>
                <Circle className="h-4 w-4 fill-current" />
                Start Recording
              </Button>
            )}
            {step === "capture" && !recording && arMeasureSupported && (
              <Button size="lg" variant="outline" onClick={handleMeasure} disabled={measuring}>
                <Ruler className="h-4 w-4" />
                {measuring ? "Measuring…" : "Measure"}
              </Button>
            )}
            {step === "capture" && recording && (
              <Button size="lg" variant="secondary" onClick={stopRecording}>
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}
            {step === "preview" && (
              <>
                <Button variant="outline" onClick={retake}>
                  <RotateCcw className="h-4 w-4" />
                  Retake
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
                Saving… {Math.round(uploadProgress * 100)}%
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
