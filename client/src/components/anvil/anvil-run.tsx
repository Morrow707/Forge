import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ANVIL_PARTS,
  GNG_TRIALS,
  HOLD_MIN_MS,
  HOLD_SPAN_MS,
  HOLD_START_WINDOW_MS,
  RT_RESPONSE_WINDOW_MS,
  RT_TRIALS,
  RT_WAIT_MIN_MS,
  RT_WAIT_SPAN_MS,
  SEQ_FLASH_MS,
  SEQ_GAP_MS,
  SEQ_MAX,
  SEQ_PADS,
  SEQ_RELAYOUT_EACH_ROUND,
  SEQ_START,
  TAP_REST_MS,
  TAP_TRIAL_MS,
  buildGngPlan,
  buildSequence,
  type AnvilPartId,
} from "@shared/anvil-tasks";
import { TAPPING_TRIALS } from "@shared/anvil-part-metrics";

/**
 * THE FOUR TASKS, RUN ON THE PHONE.
 *
 * Everything it measures it hands up raw: the trials in order, the misses, the longest sequence,
 * the three tap counts. It computes NO aggregate and no comparison -- the median, the drift, the
 * lapse count and the z-score are all derived on the server from `shared/anvil-*.ts`, so a
 * refitted constant moves every past check instead of only the ones taken after it. Same argument
 * the camera's `trackingDiagnostics` is built on, and the reason the table stores trials.
 *
 * **IT NEVER ABANDONS A PART.** A trial nobody responded to is counted as a miss and the run goes
 * on; a wrong tap in part 3 ends that part and moves to the next; a part the athlete walks away
 * from leaves `partsRun` without it, which is a stated fact rather than a null. There is no path
 * here that throws away what has already been measured -- Rule #1, on a task rather than a take.
 *
 * **TIMING COMES FROM `performance.now()` AND THE DEVICE'S RESOLUTION IS REPORTED.** A browser
 * that coarsens the clock (privacy modes do, and so does a backgrounded tab) is not producing
 * numbers comparable with one that does not, and `timerResolutionMs` is the only way anybody can
 * tell afterwards. Measured, not assumed.
 */

export type AnvilRunResult = {
  trialsMs: number[];
  omissions: number;
  rulesMissed: number;
  goTrialsMs: number[];
  sequenceBest: number | null;
  tapCounts: number[];
  partsRun: AnvilPartId[];
  timerResolutionMs: number | null;
};

/** The smallest non-zero gap this device's clock will report, sampled in a tight loop. */
function measureTimerResolution(): number | null {
  let smallest = Infinity;
  const t0 = performance.now();
  // Bounded by wall clock as well as by iterations: on a coarsened clock most reads are
  // identical and the loop would otherwise spin for its whole iteration budget.
  for (let i = 0; i < 20_000 && performance.now() - t0 < 25; i++) {
    const a = performance.now();
    const b = performance.now();
    if (b > a) smallest = Math.min(smallest, b - a);
  }
  return Number.isFinite(smallest) ? smallest : null;
}

type Stage =
  | { kind: "ready"; part: 1 | 2 | 3 | 4 }
  | { kind: "rt" }
  | { kind: "gng" }
  | { kind: "seq" }
  | { kind: "tap" };

type PanelState = "waiting" | "go" | "leave" | "hold";

const PART_TITLE: Record<1 | 2 | 3 | 4, string> = {
  1: "Tap on sight",
  2: "Three rules",
  3: "In order",
  4: "Ten seconds",
};
const PART_RULE: Record<1 | 2 | 3 | 4, string> = {
  1: "One finger, the same finger every day",
  2: "Circle tap · square nothing · triangle hold till it fills",
  3: "Three to start, one longer each time",
  4: "One panel, as fast as you can",
};

export function AnvilRun({ onDone }: { onDone: (result: AnvilRunResult) => void }) {
  const [stage, setStage] = useState<Stage>({ kind: "ready", part: 1 });

  // Everything measured lives in refs, not state: a trial's latency must not wait on a render,
  // and a re-render mid-trial must not reset a count.
  const trials = useRef<number[]>([]);
  const goTrials = useRef<number[]>([]);
  const omissions = useRef(0);
  const rulesMissed = useRef(0);
  const seqBest = useRef<number | null>(null);
  const tapCounts = useRef<number[]>([]);
  const partsRun = useRef<AnvilPartId[]>([]);
  const resolution = useRef<number | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raf = useRef<number | null>(null);
  const clearPending = useCallback(() => {
    if (timer.current != null) clearTimeout(timer.current);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    timer.current = null;
    raf.current = null;
  }, []);
  useEffect(() => clearPending, [clearPending]);

  useEffect(() => {
    resolution.current = measureTimerResolution();
  }, []);

  // A RUN REPORTS ITSELF EXACTLY ONCE. Four minutes of tasks are worth one row, and the page
  // submits whatever arrives here -- so a second call would write a second check for the same
  // morning, which the window rule would then have to arbitrate between for no reason. Guarded
  // here rather than at the page, because this is where "the run is over" is decided.
  const reported = useRef(false);
  const finish = useCallback(() => {
    if (reported.current) return;
    reported.current = true;
    clearPending();
    onDone({
      trialsMs: trials.current.slice(),
      omissions: omissions.current,
      rulesMissed: rulesMissed.current,
      goTrialsMs: goTrials.current.slice(),
      sequenceBest: seqBest.current,
      tapCounts: tapCounts.current.slice(),
      partsRun: partsRun.current.slice(),
      timerResolutionMs: resolution.current,
    });
  }, [clearPending, onDone]);

  return (
    <div className="space-y-4" data-testid="anvil-run">
      {stage.kind === "ready" && (
        <ReadyCard
          part={stage.part}
          onStart={() => {
            partsRun.current.push(ANVIL_PARTS[stage.part - 1]);
            setStage(
              stage.part === 1
                ? { kind: "rt" }
                : stage.part === 2
                  ? { kind: "gng" }
                  : stage.part === 3
                    ? { kind: "seq" }
                    : { kind: "tap" },
            );
          }}
        />
      )}

      {stage.kind === "rt" && (
        <TrialPanel
          part={1}
          total={RT_TRIALS}
          kindFor={() => "go"}
          timer={timer}
          raf={raf}
          clearPending={clearPending}
          onResponse={(ms) => trials.current.push(ms)}
          onMiss={() => omissions.current++}
          onRuleMissed={() => rulesMissed.current++}
          onComplete={() => setStage({ kind: "ready", part: 2 })}
        />
      )}

      {stage.kind === "gng" && <GngStage
        timer={timer}
        raf={raf}
        clearPending={clearPending}
        onGo={(ms) => goTrials.current.push(ms)}
        onMiss={() => rulesMissed.current++}
        onComplete={() => setStage({ kind: "ready", part: 3 })}
      />}

      {stage.kind === "seq" && (
        <SequenceStage
          timer={timer}
          clearPending={clearPending}
          onBest={(n) => {
            seqBest.current = n;
          }}
          onComplete={() => setStage({ kind: "ready", part: 4 })}
        />
      )}

      {stage.kind === "tap" && (
        <TapStage
          timer={timer}
          clearPending={clearPending}
          onTrial={(count) => tapCounts.current.push(count)}
          onComplete={finish}
        />
      )}
    </div>
  );
}

function ReadyCard({ part, onStart }: { part: 1 | 2 | 3 | 4; onStart: () => void }) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Part {part} of {ANVIL_PARTS.length}
      </p>
      <h2 className="text-xl font-semibold">{PART_TITLE[part]}</h2>
      <p className="text-sm text-muted-foreground">{PART_RULE[part]}</p>
      <Button onClick={onStart} className="w-full" data-testid="anvil-part-start">
        {part === 1 ? "Begin" : "Continue"}
      </Button>
    </div>
  );
}

/** The shape panel. One frame, no fade: a transition would be measured as latency. */
function Panel({
  state,
  holdFill,
  label,
  onPressDown,
  onPressUp,
}: {
  state: PanelState;
  holdFill?: number;
  label?: string;
  onPressDown: () => void;
  onPressUp: () => void;
}) {
  return (
    <div
      data-testid="anvil-panel"
      role="button"
      tabIndex={0}
      aria-label="Tap target"
      onPointerDown={(e) => {
        e.preventDefault();
        onPressDown();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onPressUp();
      }}
      onPointerCancel={onPressUp}
      onPointerLeave={onPressUp}
      className={cn(
        "flex h-48 w-full select-none touch-none flex-col items-center justify-center gap-4 rounded-xl border-2 transition-none",
        state === "waiting" && "border-border bg-muted",
        state === "go" && "border-emerald-500 bg-emerald-500",
        state === "leave" && "border-rose-500 bg-rose-500",
        state === "hold" && "border-sky-500 bg-sky-500",
      )}
    >
      {state === "waiting" ? (
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label ?? "Get ready"}
        </span>
      ) : (
        <>
          <span
            className={cn(
              "block h-[78px] w-[78px] bg-white/95",
              state === "go" && "rounded-full",
              state === "leave" && "rounded-lg",
            )}
            style={
              state === "hold"
                ? { clipPath: "polygon(50% 4%, 97% 96%, 3% 96%)" }
                : undefined
            }
          />
          {state === "hold" && (
            <span className="h-2.5 w-[132px] overflow-hidden rounded-full bg-white/30">
              <span
                className="block h-full rounded-full bg-white/95"
                style={{ width: `${Math.round((holdFill ?? 0) * 100)}%` }}
              />
            </span>
          )}
        </>
      )}
    </div>
  );
}

type TimerRef = React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
type RafRef = React.MutableRefObject<number | null>;

/**
 * Parts 1 and 2 are the same loop with a different trial plan, which is why this is one
 * component: two copies of a wait-then-light-then-score loop would drift on the one thing that
 * must not drift, which is when the clock starts.
 */
function TrialPanel({
  part,
  total,
  kindFor,
  timer,
  raf,
  clearPending,
  onResponse,
  onMiss,
  onRuleMissed,
  onComplete,
  rule,
}: {
  part: 1 | 2;
  total: number;
  kindFor: (i: number) => PanelState;
  timer: TimerRef;
  raf: RafRef;
  clearPending: () => void;
  onResponse: (ms: number) => void;
  onMiss: () => void;
  onRuleMissed: () => void;
  onComplete: () => void;
  rule?: string;
}) {
  const [trial, setTrial] = useState(0);
  const [state, setState] = useState<PanelState>("waiting");
  const [holdFill, setHoldFill] = useState(0);
  const litAt = useRef(0);
  const kind = useRef<PanelState>("waiting");
  const holdNeed = useRef(0);
  const holdFrom = useRef(0);
  const holdDone = useRef(false);

  const advance = useCallback(() => {
    setState("waiting");
    setHoldFill(0);
    holdFrom.current = 0;
    holdDone.current = false;
    setTrial((t) => t + 1);
  }, []);

  useEffect(() => {
    if (trial >= total) {
      clearPending();
      onComplete();
      return;
    }
    kind.current = kindFor(trial);
    timer.current = setTimeout(
      () => {
        setState(kind.current);
        if (kind.current === "hold") {
          holdNeed.current = HOLD_MIN_MS + Math.random() * HOLD_SPAN_MS;
        }
        litAt.current = performance.now();
        timer.current = setTimeout(
          () => {
            // Nobody responded. A leave trial is CORRECT to leave alone; everything else is a
            // miss, and the two are counted in different places because they mean opposite
            // things about the athlete.
            if (kind.current !== "leave") {
              if (part === 1) onMiss();
              else onRuleMissed();
            }
            advance();
          },
          kind.current === "hold" ? HOLD_START_WINDOW_MS : RT_RESPONSE_WINDOW_MS,
        );
      },
      RT_WAIT_MIN_MS + Math.random() * RT_WAIT_SPAN_MS,
    );
    return clearPending;
    // `trial` is the loop; the callbacks are stable refs from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial, total, part]);

  const pressDown = () => {
    // AN EARLY TAP IS IGNORED, NOT SCORED. Scoring it as a miss would punish a twitch during a
    // two-second wait; scoring it as a response would record a latency measured from the last
    // trial. Neither is what happened, so the trial simply carries on.
    if (state === "waiting") return;
    clearPending();
    const dt = performance.now() - litAt.current;
    if (kind.current === "go") {
      onResponse(dt);
      advance();
      return;
    }
    if (kind.current === "leave") {
      onRuleMissed();
      advance();
      return;
    }
    holdFrom.current = performance.now();
    const step = () => {
      const f = Math.min(1, (performance.now() - holdFrom.current) / holdNeed.current);
      setHoldFill(f);
      if (f >= 1) {
        holdDone.current = true;
        raf.current = null;
        advance();
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    step();
  };

  const pressUp = () => {
    if (kind.current !== "hold" || holdDone.current || !holdFrom.current) return;
    clearPending();
    onRuleMissed();
    advance();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Part {part} of {ANVIL_PARTS.length} · {PART_TITLE[part]}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="anvil-trial">
        Trial {Math.min(trial + 1, total)} of {total}
      </p>
      <Panel state={state} holdFill={holdFill} onPressDown={pressDown} onPressUp={pressUp} />
      {rule && <p className="text-center text-sm text-muted-foreground">{rule}</p>}
    </div>
  );
}

function GngStage(props: {
  timer: TimerRef;
  raf: RafRef;
  clearPending: () => void;
  onGo: (ms: number) => void;
  onMiss: () => void;
  onComplete: () => void;
}) {
  // Built once per run, so a re-render cannot reshuffle the plan half way through a round.
  const plan = useMemo(() => buildGngPlan(), []);
  return (
    <TrialPanel
      part={2}
      total={GNG_TRIALS}
      kindFor={(i) => (plan[i] as PanelState) ?? "go"}
      timer={props.timer}
      raf={props.raf}
      clearPending={props.clearPending}
      onResponse={props.onGo}
      onMiss={props.onMiss}
      onRuleMissed={props.onMiss}
      onComplete={props.onComplete}
      rule={PART_RULE[2]}
    />
  );
}

function SequenceStage({
  timer,
  clearPending,
  onBest,
  onComplete,
}: {
  timer: TimerRef;
  clearPending: () => void;
  onBest: (n: number) => void;
  onComplete: () => void;
}) {
  const [length, setLength] = useState(SEQ_START);
  const [lit, setLit] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [hint, setHint] = useState(`Watch · ${SEQ_START} to come`);
  const [layout, setLayout] = useState<number[]>(() => [...Array(SEQ_PADS).keys()]);
  const sequence = useRef<number[]>([]);
  const at = useRef(0);

  useEffect(() => {
    sequence.current = buildSequence(length);
    at.current = 0;
    setLive(false);
    setHint(`Watch · ${length} to come`);
    if (SEQ_RELAYOUT_EACH_ROUND) {
      const slots = [...Array(SEQ_PADS).keys()];
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      setLayout(slots);
    }
    let k = 0;
    const step = () => {
      if (k >= sequence.current.length) {
        setLit(null);
        setHint("Now tap them back");
        setLive(true);
        return;
      }
      setLit(sequence.current[k]);
      timer.current = setTimeout(() => {
        setLit(null);
        k++;
        timer.current = setTimeout(step, SEQ_GAP_MS);
      }, SEQ_FLASH_MS);
    };
    step();
    return clearPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  const tap = (pad: number) => {
    if (!live) return;
    if (pad !== sequence.current[at.current]) {
      // A WRONG TAP ENDS THE PART, NOT THE CHECK. The best completed round is what the span is,
      // and it is already recorded -- so there is nothing to lose by stopping here.
      setLive(false);
      clearPending();
      onComplete();
      return;
    }
    at.current++;
    if (at.current < sequence.current.length) return;
    onBest(length);
    setLive(false);
    if (length >= SEQ_MAX) {
      clearPending();
      onComplete();
      return;
    }
    setHint(`Right · ${length + 1} next`);
    timer.current = setTimeout(() => setLength((n) => n + 1), 900);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Part 3 of {ANVIL_PARTS.length} · {PART_TITLE[3]}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="anvil-seq-hint">
        {hint}
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        {[...Array(SEQ_PADS).keys()].map((i) => (
          <button
            key={i}
            type="button"
            data-testid={`anvil-pad-${i}`}
            style={{ order: layout[i] }}
            onPointerDown={(e) => {
              e.preventDefault();
              tap(i);
            }}
            className={cn(
              "aspect-square select-none touch-none rounded-xl border-2 transition-none",
              lit === i ? "border-emerald-500 bg-emerald-500" : "border-border bg-muted",
            )}
            aria-label={`Pad ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function TapStage({
  timer,
  clearPending,
  onTrial,
  onComplete,
}: {
  timer: TimerRef;
  clearPending: () => void;
  onTrial: (count: number) => void;
  onComplete: () => void;
}) {
  const [trial, setTrial] = useState(0);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(TAP_TRIAL_MS / 1000);
  const [count, setCount] = useState(0);
  const taps = useRef(0);

  const start = () => {
    // TWO CHAINS, ONE REF. `tick` reschedules itself through the shared timer ref, so a second
    // press of Start while a trial is running leaves the first chain scheduled and un-cancelled:
    // both reach zero, both report a trial, and the one that happens to be third calls
    // onComplete -- so the run ends early with a duplicated count. A double tap on a button is
    // an ordinary thing for somebody about to tap as fast as they can.
    if (running) return;
    clearPending();
    taps.current = 0;
    setCount(0);
    setRunning(true);
    const t0 = performance.now();
    const tick = () => {
      const remaining = Math.max(0, TAP_TRIAL_MS - (performance.now() - t0));
      setLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        setRunning(false);
        onTrial(taps.current);
        if (trial + 1 >= TAPPING_TRIALS) {
          clearPending();
          onComplete();
          return;
        }
        setTrial((t) => t + 1);
        return;
      }
      timer.current = setTimeout(tick, 100);
    };
    tick();
  };

  useEffect(() => clearPending, [clearPending]);

  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        Part 4 of {ANVIL_PARTS.length} · {PART_TITLE[4]}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="anvil-tap-trial">
        Trial {trial + 1} of {TAPPING_TRIALS}
      </p>
      <div
        data-testid="anvil-tap-panel"
        role="button"
        tabIndex={0}
        aria-label="Tap as fast as you can"
        onPointerDown={(e) => {
          e.preventDefault();
          if (!running) return;
          taps.current++;
          setCount(taps.current);
        }}
        className={cn(
          "flex h-48 w-full select-none touch-none items-center justify-center rounded-xl border-2",
          running ? "border-emerald-500 bg-emerald-500/10" : "border-border bg-muted",
        )}
      >
        <span className="text-5xl font-bold tabular-nums">{count}</span>
      </div>
      {running ? (
        <p className="text-center text-sm tabular-nums text-muted-foreground">
          0:{String(left).padStart(2, "0")}
        </p>
      ) : (
        <>
          <Button onClick={start} className="w-full" data-testid="anvil-tap-start">
            {trial === 0 ? "Start the ten seconds" : `Start trial ${trial + 1}`}
          </Button>
          {trial > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Three trials, and the BEST one is the number. A fumble can only make a
              maximal-effort count lower, which is the whole reason there are three.
              Rest {Math.round(TAP_REST_MS / 1000)} seconds between them.
            </p>
          )}
        </>
      )}
    </div>
  );
}
