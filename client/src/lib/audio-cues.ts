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
// Lazily created once and never closed, reused across every cue -- previously each of
// playSuccessChime/playStreakMilestoneChime/playRestOverAlarm created a brand-new AudioContext
// and closed it ~900ms later on every single call. Per this file's own top comment, iOS routes
// Web Audio through the SAME shared AVAudioSession the native camera plugin manages
// (AvBodyTrackingPlugin.swift's own .ambient/.mixWithOthers fix) -- creating and tearing down a
// context is a real session-negotiation event each time, not a free no-op, so a workout that
// plays several cues in quick succession (a PR chime, then a trophy chime, then a rest-over
// alarm) was churning that shared session repeatedly for no benefit. One persistent context
// removes that churn entirely; `resume()` below handles the one real downside (a context can
// start/end up "suspended" after a period with no user gesture) without needing a fresh one.
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedCtx) {
      const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
      sharedCtx = new AudioCtx();
    }
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
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
  } catch {
    // Web Audio isn't available in every environment -- cues just stay silent.
  }
}

/** Rising four-note arpeggio (triangle wave) -- reads as "leveling up"
 * rather than the flat repeated-pitch "done/good" success chime above, so a
 * streak milestone (see STREAK_TIERS in streak-badge.tsx) is audibly its
 * own thing, not just another success ding. Distinct on three axes from
 * playSuccessChime: melodic contour (ascending run vs. one repeated pitch),
 * waveform (triangle vs. sine), and rhythm (four notes speeding up vs.
 * three evenly-spaced beeps). */
export function playStreakMilestoneChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // C5 -> E5 -> G5 -> C6, gaps shrinking slightly so the run feels like
    // it's building momentum instead of ticking off a metronome.
    const notes: [freq: number, offset: number][] = [
      [523.25, 0],
      [659.25, 0.13],
      [783.99, 0.24],
      [1046.5, 0.34],
    ];
    notes.forEach(([freq, offset], i) => {
      const isLast = i === notes.length - 1;
      tone(ctx, freq, now + offset, isLast ? 0.35 : 0.16, "triangle", isLast ? 0.4 : 0.3);
    });
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
  } catch {
    // Web Audio isn't available in every environment -- cues just stay silent.
  }
}
