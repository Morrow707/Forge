import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/** Always-on debug readout for every AV tracker dialog -- replaces the old per-dialog
 * SHOW_DIAGNOSTIC_OVERLAY flags (each dialog had its own copy, most defaulted to false, one had
 * none at all) with one shared panel every dialog renders the same way. Deliberately not
 * gated behind a flag: while this whole pipeline is still fresh off TestFlight, "is the camera
 * actually broken or is my phone in a weird state" needs to be answerable without a code change
 * and a new build every time.
 *
 * Covers more than the raw camera diagLog it's built around -- most of what makes a tracker
 * dialog silently fail isn't a camera problem at all: no camera permission, a signed-in account
 * with no height on file (silently blocks every calibrated number), the WebView not actually
 * running as a native iOS app. Surfacing those as their own lines means a coach reading a bug
 * report over text doesn't have to guess which of those it might be. */
export function AvDiagnosticOverlay({
  supported,
  supportError,
  cameraPermission,
  analyzedFrames,
  diagLog,
  heightIn,
  extra,
}: {
  supported: boolean | null;
  supportError?: string;
  cameraPermission?: string;
  analyzedFrames: number;
  diagLog: string[];
  // Omitted by dialogs that don't take a heightIn prop at all (none currently, but keeps this
  // component honest about which callers actually have it to report).
  heightIn?: number | null;
  // One extra line of dialog-specific context (e.g. av-bar-tracker-dialog.tsx's bar_path/full
  // mode) that doesn't belong in a shared component's own fixed fields.
  extra?: string;
}) {
  // navigator.onLine only reflects "has a network interface," not "can actually reach Forge's
  // API" -- still worth surfacing, since "camera works but nothing will ever upload" is a real,
  // distinct failure mode from an actual camera/tracking bug, and this is the cheap first signal
  // for it. Listens for change instead of reading once, since a dialog can stay open across a
  // real connectivity drop.
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();

  return (
    <div className="absolute left-3 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-10 select-text space-y-0.5 rounded-md bg-black/70 px-2 py-1.5 font-mono text-[9px] leading-tight text-white/80 backdrop-blur-sm">
      <div>
        platform={platform} native={String(isNative)} online={String(online)}
      </div>
      <div>
        supported={String(supported)} permission={cameraPermission ?? "unknown"} frames={analyzedFrames}
        {extra ? ` ${extra}` : ""}
      </div>
      {heightIn !== undefined && (
        <div className={heightIn ? undefined : "text-amber-400"}>
          height={heightIn ? `${heightIn}in on file` : "NOT SET -- calibration will fail"}
        </div>
      )}
      {supportError && <div className="text-destructive">supportError: {supportError}</div>}
      {diagLog.map((line, i) => (
        <div key={i} className="text-white/60">
          {line}
        </div>
      ))}
    </div>
  );
}
