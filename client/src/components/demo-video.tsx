import { ExerciseVideoPlayer } from "@/components/exercise-video-player";
import { isUploadedVideo } from "@/lib/video-embed";
import { resolveApiUrl } from "@/lib/queryClient";

/** A demonstration video wherever it lives. A program's own upload to Forge (2026-11-19) is the
 *  program's file and plays from Forge's API host; anything else goes through the one embed
 *  player, which never re-hosts somebody else's video. */
export function DemoVideo({ url, name }: { url: string | null | undefined; name: string }) {
  if (url && isUploadedVideo(url)) {
    return (
      <video
        src={resolveApiUrl(url)}
        controls
        playsInline
        preload="metadata"
        aria-label={`${name} demo`}
        className="aspect-video w-full rounded-lg bg-black"
      />
    );
  }
  return <ExerciseVideoPlayer url={url} name={name} />;
}
