// Every audible cue in the app goes through Web Audio (never an <audio>
// element) so it mixes with whatever else is already playing (music, a
// call) instead of pausing/ducking it. That does NOT mean it survives the
// phone's hardware silent switch, despite what an earlier version of this
// comment claimed -- iOS routes web-page audio (Web Audio API included)
// through the same audio session as the ringer, and WebKit gives web
// content no way to request the "playback" category a native app can use
// to bypass it. A muted iPhone genuinely won't play this, confirmed against
// a real device; the only fix is shipping as a native app (e.g. wrapped
// with Capacitor) so it can ask for that native audio session category.
function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    return new AudioCtx();
  } catch {
    return null;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  peakGain = 0.35,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.start(start);
  osc.stop(start + duration);
}

/** Three quick high beeps -- reads unambiguously as "done/good" over music
 * or headphones, distinct from a generic notification sound. */
export function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [0, 0.25, 0.5].forEach((delay) => tone(ctx, 880, ctx.currentTime + delay, 0.2));
    setTimeout(() => ctx.close(), 900);
  } catch {
    // Web Audio isn't available in every environment -- cues just stay silent.
  }
}

/** Alternating two-tone alarm (not the "success" chime above) -- longer,
 * louder, and lower-pitched so "rest is over, get moving" doesn't read as
 * the same light "nice rep" cue used everywhere else. Meant to be called on
 * a repeating interval by the caller (see rest-timer.tsx) since one pass
 * alone is easy to miss mid-set. */
export function playRestOverAlarm() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.35, 0.7].forEach((delay) => {
      tone(ctx, 600, now + delay, 0.28, "square", 0.45);
      tone(ctx, 840, now + delay + 0.15, 0.28, "square", 0.45);
    });
    setTimeout(() => ctx.close(), 1300);
  } catch {
    // Web Audio isn't available in every environment -- cues just stay silent.
  }
}
