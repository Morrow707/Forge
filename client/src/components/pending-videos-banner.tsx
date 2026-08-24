import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { CloudUpload, ChevronRight } from "lucide-react";
import { listPendingVideos, isVideoOfflinePersistenceSupported } from "@/lib/video-offline-store";

/** Surfaces on the athlete's dashboard -- the first thing they see next
 * time they open the app -- whenever a form-check/tracker clip is still
 * sitting on-device waiting for Wi-Fi. Reads the local queue directly
 * (there's no server-side notification for this: a clip that never
 * uploaded is, by definition, something the server has never heard about),
 * so this only ever reflects what's actually still on THIS device. */
export function PendingVideosBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isVideoOfflinePersistenceSupported()) return;
    setCount(listPendingVideos().length);
  }, []);

  if (count === 0) return null;

  return (
    <Link href="/athlete/video-bank">
      <Card className="mb-6 cursor-pointer border-primary/30 bg-primary/5 transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-4">
          <CloudUpload className="h-5 w-5 shrink-0 text-primary" />
          <p className="flex-1 text-sm font-semibold text-foreground">
            {count} video{count === 1 ? "" : "s"} waiting to upload -- will finish automatically on
            Wi-Fi, or upload now from the Video Bank.
          </p>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
