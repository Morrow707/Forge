// Every audible cue in the app goes through Web Audio (never an <audio>
// element) for the same reason: it mixes with whatever else is already
// playing (music, a call) instead of pausing/ducking it, and isn't subject
// to a device's silent-mode switch the way an <audio> element is on iOS --
// so a set-complete or pose-check cue is still audible over headphones or
// music, or with the phone physically muted.
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

/** A lower, buzzier double-tone -- deliberately a different pitch and
 * timbre from the success chime so it reads as "wrong" without needing to
 * read any text on screen. */
export function playErrorTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    [0, 0.3].forEach((delay) => tone(ctx, 220, ctx.currentTime + delay, 0.25, "sawtooth", 0.3));
    setTimeout(() => ctx.close(), 700);
  } catch {
    // Web Audio isn't available in every environment -- cues just stay silent.
  }
}
