import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveApiUrl } from "@/lib/queryClient";
import { RotateCcw, Trash2, ThumbsUp, ThumbsDown, Wand2, X, Heart, Trophy, VideoOff } from "lucide-react";
import { VideoAnalysisDialog } from "@/components/video-analysis-dialog";

export type FlaggedSetVideo = {
  setNumber: number;
  videoUrl: string;
  flag: "best" | "worst" | null;
};

function FlagButton({
  active,
  onClick,
  icon: Icon,
  label,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ThumbsUp;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active ? activeClass : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// Full-screen review of a single set's form-check clip -- opened by tapping
// a set row's video pill once it already has a recording. Flagging best/worst
// here is the same action available from the compare dialog below; both
// just call onFlag, which is responsible for clearing the flag off whichever
// other set in the exercise previously held it (at most one best and one
// worst per exercise/day).
export function SetVideoPreviewDialog({
  open,
  onOpenChange,
  setNumber,
  videoUrl,
  flag,
  onFlag,
  onRetake,
  onRemove,
  favorited,
  onToggleFavorite,
  isPr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setNumber: number;
  videoUrl: string;
  flag: "best" | "worst" | null;
  onFlag: (flag: "best" | "worst" | null) => void;
  onRetake: () => void;
  onRemove: () => void;
  /** The heart -- the only thing that exempts a video from the rolling
   * storage cap (see server/video-retention-job.ts). Applies to every
   * athlete, coached or Free Agent alike. */
  favorited?: boolean;
  onToggleFavorite?: () => void;
  /** Auto-computed server-side (submitWorkoutLog) -- purely a badge, never
   * user-set, never a reason a video survives the cap on its own. */
  isPr?: boolean;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  // Same reasoning as VideoAnalysisDialog's own loadError -- without this,
  // a failed <video> load (an expired/malformed signed URL, a genuinely
  // missing file) just silently renders the browser's bare "no source"
  // icon with no explanation and no controls, indistinguishable from the
  // video never having recorded at all.
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    setLoadError(false);
  }, [videoUrl]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-screen (same pattern as VideoAnalysisDialog/
          form-video-recorder-dialog.tsx) -- besides giving the video more
          room, this fixes the native <video controls> bar's own top row
          (fullscreen/AirPlay/volume icons) rendering right under the
          notch/Dynamic Island: those icons sit near the video element's own
          top edge, so a small centered card with little top margin put that
          edge close enough to the cutout to collide with it. The safe-area
          padding below pushes the video's top edge safely clear of it. */}
      <DialogContent
        className="inset-0 top-0 left-0 flex h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 [&>button]:hidden"
        hideClose
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <DialogTitle className="text-sm text-white">Set {setNumber} — Form Check</DialogTitle>
          <div className="flex items-center gap-3">
            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                aria-label={favorited ? "Remove favorite" : "Favorite this video"}
                aria-pressed={!!favorited}
                className={cn(
                  "transition-colors",
                  favorited ? "text-destructive" : "text-white/70 hover:text-white",
                )}
              >
                <Heart className={cn("h-5 w-5", favorited && "fill-current")} />
              </button>
            )}
            <DialogClose className="rounded-sm text-white/70 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-ring">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
          {isPr && (
            <span className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-black">
              <Trophy className="h-3 w-3" />
              PR
            </span>
          )}
          {loadError ? (
            <div className="flex flex-col items-center gap-2 px-6 text-center text-sm text-white/70">
              <VideoOff className="h-8 w-8" />
              This video couldn't be loaded — it may not have finished uploading, or the file is missing.
            </div>
          ) : (
            <video
              // Same cross-origin canvas-taint fix as VideoAnalysisDialog's
              // own video element -- Analysis Tools below opens that exact
              // dialog on this same video, which draws it onto a canvas.
              crossOrigin="anonymous"
              src={resolveApiUrl(videoUrl)}
              controls
              playsInline
              className="h-full max-h-full w-full max-w-full object-contain"
              onError={() => setLoadError(true)}
            />
          )}
        </div>
        <div className="shrink-0 space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <Button variant="outline" className="w-full" onClick={() => setAnalyzing(true)}>
            <Wand2 className="h-4 w-4" />
            Analysis Tools
          </Button>
          <div className="flex items-center justify-center gap-2">
            <FlagButton
              active={flag === "best"}
              onClick={() => onFlag(flag === "best" ? null : "best")}
              icon={ThumbsUp}
              label="Best Set"
              activeClass="border-success bg-success/15 text-success"
            />
            <FlagButton
              active={flag === "worst"}
              onClick={() => onFlag(flag === "worst" ? null : "worst")}
              icon={ThumbsDown}
              label="Worst Set"
              activeClass="border-destructive bg-destructive/15 text-destructive"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
            <Button variant="outline" onClick={onRetake}>
              <RotateCcw className="h-4 w-4" />
              Retake
            </Button>
          </div>
        </div>
      </DialogContent>
      <VideoAnalysisDialog
        open={analyzing}
        onOpenChange={setAnalyzing}
        videoUrl={videoUrl}
        title={`Set ${setNumber} — Form Check`}
      />
    </Dialog>
  );
}

function pickDefault(sets: FlaggedSetVideo[], want: "best" | "worst", fallbackIndex: number) {
  return sets.find((s) => s.flag === want)?.setNumber ?? sets[fallbackIndex]?.setNumber;
}

// Side-by-side (stacked on mobile) comparison of any two recorded set
// videos for one exercise -- defaults to the flagged Worst on top and Best
// on bottom when both exist, since that's the comparison the athlete set
// the flags up for, but either side can be repointed at any recorded set.
export function SetVideoCompareDialog({
  open,
  onOpenChange,
  sets,
  onFlag,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sets: FlaggedSetVideo[];
  onFlag: (setNumber: number, flag: "best" | "worst" | null) => void;
}) {
  const [leftNumber, setLeftNumber] = useState<number | undefined>(undefined);
  const [rightNumber, setRightNumber] = useState<number | undefined>(undefined);
  // Which side (if either) has its analysis tools open -- a comparison is
  // exactly when a coach most wants to overlay a skeleton or measure an
  // angle (this rep vs. that one), but until now the tools only existed on
  // the single-video preview, not here. One shared dialog instance driven
  // by this rather than one per side, since only one can ever be open at a
  // time anyway.
  const [analyzing, setAnalyzing] = useState<{ url: string; title: string } | null>(null);
  // Which set numbers' videos failed to load, keyed by setNumber -- same
  // reasoning as SetVideoPreviewDialog's own loadError above: without this,
  // a failed load (expired/malformed signed URL, genuinely missing file)
  // just silently renders the browser's bare "no source" icon here too.
  const [loadErrors, setLoadErrors] = useState<Record<number, boolean>>({});

  const left = sets.find((s) => s.setNumber === (leftNumber ?? pickDefault(sets, "worst", 0)));
  const right = sets.find(
    (s) => s.setNumber === (rightNumber ?? pickDefault(sets, "best", sets.length - 1)),
  );

  function Slot({
    video,
    onPick,
    onAnalyze,
  }: {
    video: FlaggedSetVideo | undefined;
    onPick: (n: number) => void;
    onAnalyze: () => void;
  }) {
    if (!video) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Select value={String(video.setNumber)} onValueChange={(v) => onPick(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sets.map((s) => (
                <SelectItem key={s.setNumber} value={String(s.setNumber)}>
                  Set {s.setNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {video.flag && (
            <Badge
              className={cn(
                "gap-1 text-[10px]",
                video.flag === "best"
                  ? "bg-success/15 text-success hover:bg-success/15"
                  : "bg-destructive/15 text-destructive hover:bg-destructive/15",
              )}
            >
              {video.flag === "best" ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
              {video.flag === "best" ? "Best" : "Worst"}
            </Badge>
          )}
        </div>
        {loadErrors[video.setNumber] ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-black text-center text-xs text-white/70">
            <VideoOff className="h-5 w-5" />
            Couldn't load this video
          </div>
        ) : (
          <video
            crossOrigin="anonymous"
            src={resolveApiUrl(video.videoUrl)}
            controls
            playsInline
            className="w-full rounded-md bg-black"
            onError={() => setLoadErrors((prev) => ({ ...prev, [video.setNumber]: true }))}
          />
        )}
        <Button size="sm" variant="outline" className="w-full" onClick={onAnalyze}>
          <Wand2 className="h-3.5 w-3.5" />
          Analysis Tools
        </Button>
        <div className="flex items-center justify-center gap-2">
          <FlagButton
            active={video.flag === "best"}
            onClick={() => onFlag(video.setNumber, video.flag === "best" ? null : "best")}
            icon={ThumbsUp}
            label="Best"
            activeClass="border-success bg-success/15 text-success"
          />
          <FlagButton
            active={video.flag === "worst"}
            onClick={() => onFlag(video.setNumber, video.flag === "worst" ? null : "worst")}
            icon={ThumbsDown}
            label="Worst"
            activeClass="border-destructive bg-destructive/15 text-destructive"
          />
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compare Sets</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Slot
            video={left}
            onPick={setLeftNumber}
            onAnalyze={() => left && setAnalyzing({ url: left.videoUrl, title: `Set ${left.setNumber}` })}
          />
          <Slot
            video={right}
            onPick={setRightNumber}
            onAnalyze={() => right && setAnalyzing({ url: right.videoUrl, title: `Set ${right.setNumber}` })}
          />
        </div>
      </DialogContent>
      <VideoAnalysisDialog
        open={!!analyzing}
        onOpenChange={(o) => !o && setAnalyzing(null)}
        videoUrl={analyzing?.url ?? ""}
        title={analyzing?.title}
      />
    </Dialog>
  );
}
