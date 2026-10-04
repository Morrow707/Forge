import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, getJson } from "@/lib/queryClient";
import { speakableText } from "@shared/read-aloud-text";
import { Pause, Play, Square, Volume2 } from "lucide-react";

/** Listen to a lesson page (2026-10-04). Two voices, one control: when Forge has a narrator
 * configured (server/read-aloud.ts), the page's narration is fetched, made once and cached,
 * and played as audio; when it has not, the device's own speech engine reads the same text
 * and the control says so, because the two sound nothing alike and a reader should know
 * which one they are getting. The text is shaped by speakableText either way. */
export function ReadAloud({
  text,
  fetchNarration,
}: {
  text: string;
  /** Asks the server for this text's narration URL; resolves null when there is no narrator. */
  fetchNarration?: () => Promise<string | null>;
}) {
  const { data: status } = useQuery<{ available: boolean }>({
    queryKey: ["/api/read-aloud/status"],
    queryFn: () => getJson("/api/read-aloud/status"),
    staleTime: 10 * 60 * 1000,
  });
  const narrated = Boolean(status?.available && fetchNarration);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [usingDevice, setUsingDevice] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  function stop() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (canSpeak) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState("idle");
  }

  // A new page, or leaving the page, stops the voice: nothing reads on after its text is gone.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), [text]);

  function speakWithDevice() {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakableText(text));
    u.rate = 0.95;
    u.onend = () => setState("idle");
    u.onerror = () => setState("idle");
    utteranceRef.current = u;
    setUsingDevice(true);
    window.speechSynthesis.speak(u);
    setState("playing");
  }

  async function play() {
    if (state === "paused") {
      if (usingDevice && canSpeak) window.speechSynthesis.resume();
      else await audioRef.current?.play();
      setState("playing");
      return;
    }
    if (narrated) {
      setState("loading");
      try {
        const url = await fetchNarration!();
        if (url) {
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = url;
          audioRef.current.onended = () => setState("idle");
          audioRef.current.onerror = () => setState("idle");
          setUsingDevice(false);
          await audioRef.current.play();
          setState("playing");
          return;
        }
      } catch {
        /* the narrator failed: fall through to the device voice */
      }
    }
    if (canSpeak) speakWithDevice();
    else setState("idle");
  }

  function pause() {
    if (usingDevice && canSpeak) window.speechSynthesis.pause();
    else audioRef.current?.pause();
    setState("paused");
  }

  if (!narrated && !canSpeak) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {state === "idle" || state === "loading" ? (
        <Button size="sm" variant="outline" onClick={() => void play()} disabled={state === "loading"}>
          <Volume2 className="h-3.5 w-3.5" />
          {state === "loading" ? "Getting the narration…" : "Listen"}
        </Button>
      ) : (
        <>
          <Button size="sm" variant="outline" onClick={() => (state === "playing" ? pause() : void play())}>
            {state === "playing" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {state === "playing" ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" variant="ghost" onClick={stop}>
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        </>
      )}
      {state !== "idle" && (
        <span>{usingDevice ? "Read by your device's voice." : "Narrated."}</span>
      )}
      {state === "idle" && !narrated && <span>Read by your device's voice.</span>}
    </div>
  );
}

/** The fetch for a class lesson page. 204 (no narrator) resolves null. */
export async function fetchClassPageNarration(classId: number, lessonId: number, pageIndex: number): Promise<string | null> {
  const res = await apiRequest("POST", `/api/athlete/classes/${classId}/lessons/${lessonId}/narration`, { pageIndex });
  if (res.status === 204) return null;
  const body = (await res.json()) as { url: string };
  return body.url;
}

/** The fetch for a Coaches Corner lesson. */
export async function fetchTrackLessonNarration(lessonId: number): Promise<string | null> {
  const res = await apiRequest("POST", `/api/coach/academy/lessons/${lessonId}/narration`, {});
  if (res.status === 204) return null;
  const body = (await res.json()) as { url: string };
  return body.url;
}
