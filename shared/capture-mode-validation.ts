/**
 * WHICH CAPTURE MODES HAVE BEEN CHECKED AGAINST REALITY, AND WHICH HAVE NOT.
 *
 * Every camera number in Forge carries the same accuracy caveat, which is honest but blunt: it
 * says the same thing about a back squat, checked against real lifts, and a golf swing, whose
 * every threshold is a guess nobody has ever held against a real swing. A coach reading both
 * warnings has no way to tell that one mode has evidence behind it and the other has none.
 *
 * "Unvalidated" here does NOT mean the numbers are withheld -- rule #1, a filmed set always gets
 * its row. It means nobody has yet compared them to anything, and a reader deserves to know
 * which of those two situations they are in.
 *
 * THE LIST GROWS ONLY WHEN SOMEBODY ACTUALLY FILMS. Promoting a mode here is a claim that real
 * footage was run through it and the numbers held up, so it is deliberately a separate, explicit
 * decision rather than something that drifts upward as code gets written. CLAUDE.md's own
 * movement library makes the same argument for the same reason: "a page each would be eight
 * pages of invented authority."
 */

export type ValidationState =
  /** Real lifts have been filmed and the numbers checked. */
  | "validated"
  /** The pipeline runs and produces numbers; nobody has held them against anything. */
  | "unvalidated"
  /** Runs, and is KNOWN to have a specific problem that is not yet fixed. */
  | "known_issue";

export type ModeValidation = {
  mode: string;
  state: ValidationState;
  /** What was checked, or what is known to be wrong. Never empty. */
  note: string;
};

export const CAPTURE_MODE_VALIDATION: ModeValidation[] = [
  {
    mode: "bar_path",
    state: "validated",
    note: "Back squat, Pendlay row and bench press have been filmed against real lifts. Scale remains the weak link on a bench filmed from the foot of the bench, where the athlete's own height cannot be read.",
  },
  {
    mode: "full",
    state: "validated",
    note: "Same pipeline as bar_path plus velocity and power. Checked against a bar sensor on bench press: range of motion and mean velocity were close, peak velocity was not, and the wander fixes were built from that.",
  },
  {
    mode: "jump",
    state: "known_issue",
    note: "Box jump has been filmed and over-counts reps on some takes. Flight-time height is sound; the segmentation is what is being worked on. A FLAT jump additionally produces the gravity ruler, which needs no scale at all.",
  },
  {
    mode: "sprint",
    state: "unvalidated",
    note: "Runs and reports, never checked against a stopwatch or timing gates. Treat the times as relative until somebody does.",
  },
  {
    mode: "mechanics",
    state: "unvalidated",
    note: "Runs and reports. No drill has been filmed and compared to anything.",
  },
  {
    mode: "golf_swing",
    state: "unvalidated",
    note: "Hip-shoulder separation and tempo come off the body tracker and have never been held against a real swing or a launch monitor. The club itself is deliberately not tracked.",
  },
  {
    mode: "baseball_swing",
    state: "unvalidated",
    note: "As golf_swing: body-tracker rotation signals only, never checked against a real swing. The bat is not tracked.",
  },
  {
    mode: "med_ball",
    state: "unvalidated",
    note: "Uses the object detector, whose med_ball class was trained on ten labelled instances. Never checked against a measured throw.",
  },
  {
    mode: "kb_swing",
    state: "unvalidated",
    note: "Reports full 3D speed rather than the vertical-only formula the bar modes use. Never filmed and checked.",
  },
  {
    mode: "horizontal_load",
    state: "unvalidated",
    note: "Reuses the sprint checkpoint model for a sled push or carry. Never filmed and checked, and it inherits sprint's own unvalidated timing.",
  },
];

export function validationForMode(mode: string | null | undefined): ModeValidation | null {
  if (!mode) return null;
  return CAPTURE_MODE_VALIDATION.find((m) => m.mode === mode) ?? null;
}

/** One line for a report entry, so a reader knows what kind of number they are looking at. */
export function validationNote(mode: string | null | undefined): string | null {
  const v = validationForMode(mode);
  if (!v) return null;
  const prefix =
    v.state === "validated"
      ? "This mode has been checked against real lifts."
      : v.state === "known_issue"
        ? "This mode has been filmed and has a KNOWN problem."
        : "NOTHING IN THIS MODE HAS EVER BEEN CHECKED against a real measurement.";
  return `${prefix} ${v.note}`;
}
