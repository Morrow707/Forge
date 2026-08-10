// Independent confirmation signal for jump landings, alongside the purely
// visual (ankle-position) state machine in jump-tracking.ts -- a real
// landing usually makes a distinct sound (feet or a box surface meeting
// the ground), which a quiet standing-still moment or a footing
// adjustment between jumps doesn't. This only ever ADDS information (a
// per-jump audioConfirmed flag); it never overrides or gates the visual
// detector, since a soft-landing technique or a loud gym's background
// noise could legitimately produce a real jump with no audio spike, or a
// spike with no jump (someone dropping a plate nearby) -- treating audio
// as a hard requirement would just trade one kind of false positive for a
// new kind of false negative. Deliberately scoped to jump mode only: a
// controlled squat or bench rep has no equivalent "landing" moment to
// listen for, so lift tracking never requests microphone access at all.
const SAMPLE_INTERVAL_MS = 30;

export type AudioSample = { t: number; amplitude: number };

export class LandingAudioListener {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private samples: AudioSample[] = [];
  private startTime = 0;
  private intervalId: number | null = null;

  // Starts sampling RMS amplitude from `stream`'s audio track, if it has
  // one -- silently does nothing (stop() then returns an empty array)
  // when the stream has no audio track, so a caller that couldn't get mic
  // permission just gets "no audio data" rather than a crash. startTimeMs
  // should be the same clock origin (performance.now()-based) the caller
  // times its visual trace against, so landing timestamps from both line
  // up in wasLandingAudioConfirmed below.
  start(stream: MediaStream, startTimeMs: number): void {
    this.reset();
    if (stream.getAudioTracks().length === 0) return;
    this.startTime = startTimeMs;
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    source.connect(this.analyser);
    this.intervalId = window.setInterval(() => this.sample(), SAMPLE_INTERVAL_MS);
  }

  private sample(): void {
    if (!this.analyser || !this.dataArray) return;
    this.analyser.getByteTimeDomainData(this.dataArray);
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const normalized = (this.dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / this.dataArray.length);
    this.samples.push({ t: performance.now() - this.startTime, amplitude: rms });
  }

  // Stops sampling and returns everything collected since start() --
  // safe to call even if start() never actually began sampling (no audio
  // track), in which case this just returns an empty array.
  stop(): AudioSample[] {
    const samples = this.samples;
    this.reset();
    return samples;
  }

  reset(): void {
    if (this.intervalId != null) window.clearInterval(this.intervalId);
    this.intervalId = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.samples = [];
  }
}

// How far (ms) around a candidate landing moment to look for a loud
// transient -- wide enough to cover audio/video timing drift and the
// brief delay between visual touchdown and the sound actually
// registering, narrow enough that an unrelated later sound doesn't
// falsely confirm an earlier landing.
const MATCH_WINDOW_MS = 150;
// How many times the set's own median (ambient) amplitude a sample has to
// exceed to count as a loud transient -- relative to this specific set's
// own noise floor rather than a fixed absolute number, so a loud gym with
// music playing doesn't need a different threshold than a quiet home
// setup recorded on the same phone.
const TRANSIENT_RATIO = 2.5;

// Pure matching logic, split out for testability (same reasoning as
// bar-tracking.ts/implement-tracking.ts's other pure helpers): given a
// full audio trace and a candidate landing timestamp (same clock origin),
// was there a loud transient nearby? Returns null (never false) when
// there's no usable audio trace to check against at all -- too few
// samples, or a silent/flat trace with no real ambient level to compare
// against -- so callers can tell "confirmed false" apart from "never had
// audio to confirm with" rather than treating both the same.
export function wasLandingAudioConfirmed(samples: AudioSample[], landingT: number): boolean | null {
  if (samples.length < 4) return null;
  const sorted = [...samples].map((s) => s.amplitude).sort((a, b) => a - b);
  const medianAmbient = sorted[Math.floor(sorted.length / 2)];
  if (medianAmbient <= 0) return null;
  return samples.some(
    (s) => Math.abs(s.t - landingT) <= MATCH_WINDOW_MS && s.amplitude >= medianAmbient * TRANSIENT_RATIO,
  );
}
