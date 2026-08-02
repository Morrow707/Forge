import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Video, Circle, Square, RotateCcw, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MAX_SECONDS = 60;

type Step = "record" | "preview" | "uploading";

// Records a short clip entirely on-device (getUserMedia + MediaRecorder).
// Nothing is uploaded until the athlete explicitly taps Save -- a discarded
// or abandoned recording never leaves the browser.
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

  const [step, setStep] = useState<Step>("record");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("record");
    setCameraError(null);
    setRecording(false);
    setElapsed(0);
    setPreviewUrl(null);
    setBlob(null);
    chunksRef.current = [];

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: true })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError("Camera access denied or unavailable."));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      const recordedBlob = new Blob(chunksRef.current, { type: mimeType ?? "video/webm" });
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

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
    setStep("record");
  }

  async function save() {
    if (!blob) return;
    setStep("uploading");
    try {
      const formData = new FormData();
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      formData.append("video", blob, `form-check.${ext}`);
      const res = await apiRequest("POST", "/api/athlete/form-video", formData);
      const { url } = await res.json();
      onSaved(url);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed — try again");
      setStep("preview");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            Record Form Check
          </DialogTitle>
          <DialogDescription>
            Stays on this device unless you save it — discard anytime with no upload.
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-md bg-black">
          {step === "preview" && previewUrl ? (
            <video src={previewUrl} controls className="w-full" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="w-full" />
          )}
          {step === "record" && recording && (
            <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
              <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
              {elapsed}s / {MAX_SECONDS}s
            </div>
          )}
        </div>

        {cameraError && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {cameraError}
          </p>
        )}

        <DialogFooter>
          {step === "record" && !recording && (
            <Button onClick={startRecording} disabled={!!cameraError}>
              <Circle className="h-4 w-4 fill-current" />
              Start Recording
            </Button>
          )}
          {step === "record" && recording && (
            <Button variant="secondary" onClick={stopRecording}>
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
              Saving…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
