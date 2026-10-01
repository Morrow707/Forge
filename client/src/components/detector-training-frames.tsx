import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Film } from "lucide-react";
import { toast } from "sonner";
import { resolveApiUrl } from "@/lib/queryClient";
import { extractFramesFromVideo } from "@/lib/extract-video-frames";
import { buildStoredZip, type ZipEntry } from "@/lib/zip-store";
import { shareOrDownloadBlob, describeSaveOutcome } from "@/lib/share-file";

type Clip = {
  seq: number;
  athlete: string;
  date: string;
  exerciseName: string;
  setNumber: number | null;
  trackingLevel: string | null;
  videoUrl: string;
  uploadedAt: string | null;
};

/**
 * TURNING FILMED SETS INTO DETECTOR TRAINING DATA.
 *
 * The object detector reads 0.02 confidence on the barbell class, and the reason is not
 * architectural: it was trained on THREE labelled barbell instances and twelve plates, every one
 * of them a photograph of an empty gym -- barbells racked, plates stacked on plate trees, nobody
 * lifting. That is the opposite of the scene it has to work in, and training on it is how a rack
 * upright came back boxed as a plate at 3.4x an athlete's hand span.
 *
 * Every set anybody films is already the right scene, at the right angle and distance, and is
 * already captured. This pulls stills out of it.
 *
 * NOTHING IS STORED. Extraction runs in this browser and the frames go straight into a download
 * -- no new copy of anyone's footage comes to rest anywhere. That is the right default for
 * athlete video whatever the purpose, and it also means no consent question to answer about a
 * second place the video now lives.
 */
export function DetectorTrainingFrames() {
  const [framesPerClip, setFramesPerClip] = useState("8");
  const [busySetId, setBusySetId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const { data, isLoading, isError } = useQuery<{ clips: Clip[] }>({
    queryKey: ["/api/admin/detector-training-clips?limit=40"],
  });

  async function pull(clip: Clip) {
    const count = Math.min(Math.max(parseInt(framesPerClip, 10) || 8, 1), 40);
    setBusySetId(clip.seq);
    setProgress(0);
    try {
      const frames = await extractFramesFromVideo(
        resolveApiUrl(clip.videoUrl),
        count,
        `${clip.exerciseName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${clip.date}-set${clip.setNumber ?? "x"}`,
        (done, total) => setProgress(Math.round((done / total) * 100)),
      );
      if (frames.length === 0) throw new Error("No frames came out of that clip.");
      const entries: ZipEntry[] = [];
      for (const f of frames) {
        entries.push({ name: f.name, bytes: new Uint8Array(await f.blob.arrayBuffer()) });
      }
      // A manifest beside the images, because a folder of jpegs cannot say which clip they came
      // from or when -- and "which clip was this frame from" is the first question asked when a
      // label turns out to be wrong.
      entries.push({
        name: "frames.json",
        bytes: new TextEncoder().encode(
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              exerciseName: clip.exerciseName,
              date: clip.date,
              setNumber: clip.setNumber,
              trackingLevel: clip.trackingLevel,
              athlete: clip.athlete,
              frames: frames.map((f) => ({ name: f.name, atSeconds: f.atSeconds })),
            },
            null,
            1,
          ),
        ),
      });
      const zip = buildStoredZip(entries);
      const outcome = await shareOrDownloadBlob(
        zip,
        `forge-detector-frames-set${clip.seq}.zip`,
        "Forge detector training frames",
      );
      if (outcome.kind === "failed") toast.error(describeSaveOutcome(outcome, "frames"));
      else toast.success(describeSaveOutcome(outcome, "frames"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not pull frames from that clip.");
    } finally {
      setBusySetId(null);
      setProgress(0);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-4 w-4" /> Detector training frames
        </CardTitle>
        <CardDescription>
          The object detector was trained on 3 barbell instances and 12 plates, all of them photos
          of an empty gym, racked bars and plate trees, nobody lifting. That is why it reads a
          rack upright as a plate. These are frames from real filmed sets: a loaded bar, an
          athlete under it, at the angle and distance the detector actually has to work at.
          Extraction runs in this browser and nothing is stored, the frames go straight to a
          download.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="frames-per-clip">Frames per clip</Label>
            <Input
              id="frames-per-clip"
              type="number"
              min={1}
              max={40}
              value={framesPerClip}
              onChange={(e) => setFramesPerClip(e.target.value)}
              className="w-24"
            />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            Spread evenly across the set, not taken from one second of it, consecutive frames are
            near-duplicates and a model learns nothing from seeing the same picture forty times.
          </p>
        </div>

        {isLoading && <p className="text-muted-foreground">Loading clips...</p>}
        {isError && <p className="text-destructive">Could not load the clip list.</p>}
        {data && data.clips.length === 0 && (
          <p className="text-muted-foreground">
            No filmed sets with video yet. Film one and it will appear here.
          </p>
        )}

        {data && data.clips.length > 0 && (
          <div className="divide-y divide-border rounded-md border border-border">
            {data.clips.map((clip) => (
              <div key={clip.seq} className="flex items-center justify-between gap-3 p-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{clip.exerciseName}</p>
                  <p className="text-xs text-muted-foreground">
                    {clip.date} · set {clip.setNumber ?? "?"} · {clip.athlete}
                    {clip.trackingLevel ? ` · ${clip.trackingLevel}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busySetId !== null}
                  onClick={() => pull(clip)}
                >
                  {busySetId === clip.seq ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {progress}%
                    </>
                  ) : (
                    "Pull frames"
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
