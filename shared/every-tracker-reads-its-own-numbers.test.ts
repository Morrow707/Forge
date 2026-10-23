/**
 * THE RATCHET ON "EVERYTHING SEPARATE". Added 2026-10-20.
 *
 * Scott: "I want everything separate, everything needs its own place." The registry that answers
 * that has existed since 2026-10-06 -- 270 identities, a fresh record each, every value copied
 * from the constant it came from. What nobody checked for ten days is WHO READS IT, and on
 * 2026-10-16 a verification pass confirmed the records were real and never asked. The answer was
 * ONE TRACKER OF FIFTEEN: `av-bar-tracker-dialog.tsx` and nothing else, so the Box Jump under
 * test and all 216 skill drills ran entirely off shared module constants while the file that
 * describes the separation said it was done.
 *
 * THE ASSERTION'S DIRECTION IS THE WHOLE POINT, and CLAUDE.md has had to relearn it seven times
 * (the public legal doc absent from the set its own scan iterated; the upload-directory list that
 * could not fail for a directory nobody added; the email glob that could not see a file named
 * something else). So this holds no list of trackers: it reads the dialog DIRECTORY, and every
 * file it finds must either resolve a record or be named in NOT_PLUMBED_YET with a reason. The
 * list is what must shrink, and an entry costs a sentence that shows up in a grep -- the same
 * shape as `FITTED_OVERRIDES`, `NOT_PUBLIC_ON_PURPOSE` and `PRICED_WITHOUT_A_CHECKOUT`.
 *
 * IT PROVES PLUMBING, NOT CALIBRATION, and the difference matters because conflating them is how
 * 2026-10-16 produced a clean bill of health. `FITTED_OVERRIDES` is empty, so every record holds
 * the same value today: a wired tracker is one that CAN be calibrated apart, never one that has
 * been. Two separate claims, two separate tests.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { trackingLevelEnum } from "./schema";
import {
  TRACKER_FOR_TRACKING_LEVEL,
  type CaptureTrackingLevel,
  type FilmingTracker,
  cameraTunablesFor,
  SHARED_CAMERA_TUNABLES,
} from "./camera-tunables-by-lift";

const COMPONENTS = join(__dirname, "..", "client", "src", "components");

/** A dialog that does not resolve a record yet, and why not. A reason under eighty characters is
 *  a placeholder rather than an argument, so the test refuses one -- somebody adding an entry has
 *  to say what that tracker would read and what is in the way. */
const NOT_PLUMBED_YET: Record<string, string> = {
  "av-sprint-tracker-dialog.tsx":
    "A sprint is timed, not scaled: no scale blend, no ruler uncertainty and no metre-per-second " +
    "frame gate exists on this path (MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC is in yards per " +
    "second and stays in its own file), so there is nothing in the record for it to read yet. " +
    "Wiring it means putting the sprint's own gate in the registry first, in its own units.",
  "av-mechanics-tracker-dialog.tsx":
    "Reads MAX_PLAUSIBLE_WRIST_SPEED_MPS from mechanics-tracking.ts, which IS in the registry as " +
    "the mechanics tracker's maxPlausibleSpeedMps (20) -- but the gate is applied inside " +
    "mechanics-tracking.ts rather than at the dialog, so the parameter has to be threaded through " +
    "that module the way robustPeakSpeed's was before the dialog can pass this drill's own value.",
  "av-horizontal-load-tracker-dialog.tsx":
    "A sled push or loaded carry covers a known distance in a straight line and takes its scale " +
    "from that distance, not from a body ruler or an object; it runs no scale blend at all. The " +
    "registry has no horizontal_load field it would read today, which is the open half of Rule " +
    "#4 for this mode (it names no object system either) and is one job, not two.",
  // THESE FOUR REASONS WERE REWRITTEN 2026-10-23 BECAUSE THEY WERE WRONG IN THREE WAYS, and the
  // wrongness all pointed the same way: it made these files sound unreachable and identical to
  // their twins, so nobody looked at them.
  //
  // (1) "Android is parked" is not why they are not wired. `isAvPreviewPlatform()` is
  //     `Capacitor.isNativePlatform() && getPlatform() === "ios"`, so these four run on EVERY
  //     BROWSER -- including the live website on a laptop. They are the web path, not an Android
  //     path, and nothing about them is parked.
  // (2) "Same shape as the av- dialog" is false for three of the four: kb-swing and swing hold
  //     no registry-eligible constant at all, and medball holds exactly one (its 25 m/s ball
  //     gate, which is already the registry's `med_ball.maxPlausibleSpeedMps`).
  // (3) The claim that medball "carries the same stale literal" -- the 0.05 height-ruler
  //     uncertainty -- is simply not true: that file runs no scale blend, has no height ruler
  //     and contains no 0.05. CLAUDE.md repeats the claim and is wrong about it too.
  "bar-tracker-dialog.tsx":
    "The WEB half of the bar tracker (MediaPipe, a separate implementation from its iOS twin), " +
    "and it runs in any browser -- not an Android-only path. NOT the same shape as the av- " +
    "dialog: its per-frame plausibility gate is a module-level MAX_PLAUSIBLE_VELOCITY_MPS of 4 " +
    "where the iOS dialog's is a function-local 3 and the registry's bar value is 3. Three " +
    "copies, two values, none reading the record. Wiring it is a NUMBER MOVING on the web path " +
    "(4 -> 3) and no web capture has been filmed beside the sensor, so it waits on evidence " +
    "rather than on a device -- Rule #5.",
  "kb-swing-tracker-dialog.tsx":
    "The web half of the kettlebell swing tracker, live in any browser. It holds NO " +
    "registry-eligible constant: no scale blend, no ruler uncertainty, and its only module " +
    "constant is MIN_BELL_SPEED_SAMPLES, which is a sample count rather than a fitted gate. " +
    "There is nothing here for a record to hand it, so wiring it would be cosmetic and would " +
    "take it off this list under false pretences.",
  "medball-tracker-dialog.tsx":
    "The web half of the med ball tracker, live in any browser. Its one registry-eligible " +
    "constant is MAX_PLAUSIBLE_BALL_SPEED_MPS = 25, which already equals the registry's " +
    "med_ball.maxPlausibleSpeedMps, and it is read behind a movementProfile override. It runs no " +
    "scale blend, so it has no height ruler and none of the stale 0.05 its iOS twin carries. " +
    "Wiring the one gate moves no number and is the smallest of the four; it waits only so the " +
    "web halves land together with the bar's 4-vs-3 decision above.",
  "swing-tracker-dialog.tsx":
    "The web half of the golf and baseball swing tracker, live in any browser. Like kb-swing it " +
    "declares no module constant at all -- the registry has nothing to give it today, and its " +
    "iOS twin's separation (golf and baseball as distinct identities off the sport prop) is " +
    "about a scale blend this file does not run.",
  "sprint-tracker-dialog.tsx":
    "The web/Android half of the sprint tracker, and blocked by the same thing as its iOS twin: a " +
    "timed sprint reads no ruler uncertainty and its speed gate is in yards per second, so the " +
    "registry has nothing for it yet. Wiring waits on the sprint's own gate being added.",
  "mechanics-tracker-dialog.tsx":
    "The web/Android half of the mechanics tracker, blocked by the same thing as its iOS twin: " +
    "the wrist speed gate is applied inside mechanics-tracking.ts, so that module needs the " +
    "defaulted parameter before either dialog can hand it this drill's own number.",
  "horizontal-load-tracker-dialog.tsx":
    "The web/Android half of the horizontal load tracker, blocked by the same thing as its iOS " +
    "twin: a distance-scaled mode runs no scale blend and the registry has no field it would " +
    "read. Same one job as the av- half, done at the same time.",
};

/** The ARGUMENT TEXT of every `cameraTunablesFor(...)` call in a file, paren-matched so a nested
 *  call or a ternary inside the arguments is kept whole. Assertions go against this rather than
 *  against the file, because a file-wide `includes` is satisfied by a comment -- which is exactly
 *  how the first version of the tracker-default case came to pass under a mutation. */
function tunableCallArguments(src: string): string[] {
  const out: string[] = [];
  const needle = "cameraTunablesFor(";
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at === -1) break;
    let depth = 0;
    let i = at + needle.length - 1;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(at + needle.length, i));
    from = i + 1;
  }
  return out;
}

const dialogs = readdirSync(COMPONENTS)
  .filter((f) => f.endsWith("-tracker-dialog.tsx"))
  .sort();

describe("every tracker reads its own numbers", () => {
  it("finds every tracker dialog on disk, never from a list", () => {
    // The scan is the mechanism; a count assertion is only here so a glob that silently stops
    // matching cannot turn this whole file green. Fifteen today.
    expect(dialogs.length).toBeGreaterThanOrEqual(15);
    expect(dialogs).toContain("av-bar-tracker-dialog.tsx");
    expect(dialogs).toContain("av-jump-tracker-dialog.tsx");
  });

  it("has every dialog either resolving a record or named with a reason", () => {
    const unexplained: string[] = [];
    for (const f of dialogs) {
      const src = readFileSync(join(COMPONENTS, f), "utf8");
      const resolves = src.includes("cameraTunablesFor(");
      if (resolves) continue;
      if (!(f in NOT_PLUMBED_YET)) unexplained.push(f);
    }
    expect(unexplained).toEqual([]);
  });

  it("REFUSES A STALE EXEMPTION: a dialog that got wired must leave the list", () => {
    // The direction that makes this a ratchet rather than a record. Without it the list only ever
    // grows, and a tracker could be wired and still read as exempt -- which is how the per-lift
    // registry came to look finished on 2026-10-16.
    const wiredButListed = Object.keys(NOT_PLUMBED_YET).filter((f) => {
      if (!dialogs.includes(f)) return false;
      return readFileSync(join(COMPONENTS, f), "utf8").includes("cameraTunablesFor(");
    });
    expect(wiredButListed).toEqual([]);
  });

  it("refuses an exemption whose reason is a placeholder", () => {
    for (const [f, reason] of Object.entries(NOT_PLUMBED_YET)) {
      expect(reason.length, `${f}'s reason is too short to be an argument`).toBeGreaterThan(80);
      // Must say what is in the way, not merely that something is.
      expect(reason, `${f}'s reason names no file, field or blocker`).toMatch(
        /registry|field|gate|module|parameter|Android|device|scale|twin/,
      );
    }
  });

  it("names a dialog in the list that no longer exists", () => {
    const gone = Object.keys(NOT_PLUMBED_YET).filter((f) => !dialogs.includes(f));
    expect(gone).toEqual([]);
  });

  it("NO EXEMPTION MAY BLAME ANDROID, because none of these is an Android-only path", () => {
    // The misreading this list carried from 2026-10-20 to 2026-10-23. Four reasons said the
    // non-`av-` dialogs waited on an Android device, which made them sound unreachable and so
    // unexamined. They are the WEB path: `isAvPreviewPlatform()` is
    // `Capacitor.isNativePlatform() && getPlatform() === "ios"`, so every one of them runs in an
    // ordinary browser, on the live website, today.
    //
    // Stated as what is FORBIDDEN rather than as the shape of today's reasons: a future entry
    // may be blocked by anything real, but not by a platform these files do not depend on.
    const chooser = readFileSync(
      join(__dirname, "..", "client", "src", "lib", "native-av-preview.ts"),
      "utf8",
    );
    // The premise, read off the chooser rather than asserted: iOS-native is the ONLY branch that
    // selects an `av-` dialog, so everything else is the browser.
    expect(chooser).toMatch(
      /export function isAvPreviewPlatform\(\): boolean \{\s*return Capacitor\.isNativePlatform\(\) && Capacitor\.getPlatform\(\) === "ios";/,
    );
    for (const [file, reason] of Object.entries(NOT_PLUMBED_YET)) {
      // "Android is parked" / "no Android device" as the BLOCKER. The word may appear in a
      // reason that explains the platform split; what it may not do is carry the excuse, so the
      // test looks for it next to the language of being blocked.
      expect(
        /no android device|android is parked with no device|waits? (?:for|on) the pass that can/i.test(reason),
        `${file}'s reason blames Android or an untestable device; it runs in every browser`,
      ).toBe(false);
    }
  });

  it("THE FIVE SCALE-BLENDING TRACKERS ARE ALL WIRED, which is what a filmed set reads", () => {
    // Every dialog that runs reconcileScaleEstimates decides a take's SCALE, and scale is the
    // error every sensor pairing since 2026-10-04 has been chasing. So these are the ones where
    // an unplumbed record is not a tidiness problem: on 2026-10-19 the Box Jump's scale was
    // decided by body3DCorrectedUncertainty, which was fitted on seven BENCH presses.
    for (const f of dialogs) {
      const src = readFileSync(join(COMPONENTS, f), "utf8");
      if (!src.includes("reconcileScaleEstimates(")) continue;
      expect(src, `${f} blends a scale without resolving its own numbers`).toContain(
        "cameraTunablesFor(",
      );
    }
  });

  it("NEVER LETS A TRACKER DEFAULT TO THE BAR'S GATES", () => {
    // `cameraTunablesFor`'s third parameter defaults to "bar", so a call that omits it hands a
    // thrown med ball the bar's 3 m/s frame ceiling -- Scott's own example of the thing that must
    // not happen. Every dialog's call names its tracker, and names it through
    // TRACKER_FOR_TRACKING_LEVEL rather than a string literal, which is what keeps a rename from
    // silently reintroducing the default.
    //
    // IT READS THE CALL'S OWN ARGUMENTS, NOT THE FILE, and the first version of this case did the
    // latter and was WORTHLESS: the comment above the call in av-jump-tracker-dialog.tsx contains
    // the words "TRACKER_FOR_TRACKING_LEVEL", so replacing the call's mapping with a bare "jump"
    // literal left the test green. That is CLAUDE.md's stripe-checkout lesson inverted -- there a
    // paragraph pushed a guard out of a character window and turned a test red; here a paragraph
    // turned one green, which is the worse direction because nothing announces it.
    for (const f of dialogs) {
      const src = readFileSync(join(COMPONENTS, f), "utf8");
      const calls = tunableCallArguments(src);
      if (calls.length === 0) continue;
      if (f === "av-bar-tracker-dialog.tsx") {
        // The bar dialog IS the bar, so the default is correct there and it predates the mapping.
        expect(calls.length).toBeGreaterThan(0);
        continue;
      }
      for (const args of calls) {
        expect(args, `${f} resolves a record without naming its tracker through the mapping`).toContain(
          "TRACKER_FOR_TRACKING_LEVEL",
        );
      }
    }
  });

  it("maps every tracking level the database can store", () => {
    // The union in camera-tunables-by-lift.ts is hand-written, because that module is in the
    // client bundle and shared/schema.ts is deliberately kept out of it. A test file has no such
    // constraint, so this is where the two are held equal -- a level added to the pgEnum fails
    // here rather than resolving to undefined and reading every gate as NaN downstream.
    const fromDb = [...trackingLevelEnum.enumValues].sort();
    const fromRegistry = Object.keys(TRACKER_FOR_TRACKING_LEVEL).sort();
    expect(fromRegistry).toEqual(fromDb);
    for (const level of fromDb as CaptureTrackingLevel[]) {
      const tracker = TRACKER_FOR_TRACKING_LEVEL[level];
      if (level === "none") {
        expect(tracker).toBeNull();
        continue;
      }
      expect(tracker, `${level} maps to nothing`).not.toBeNull();
      // And the tracker it names resolves a real record rather than falling through.
      const resolved = cameraTunablesFor("any lift", null, tracker as FilmingTracker);
      expect(resolved.tracker).toBe(tracker);
      expect(resolved.values).not.toBe(SHARED_CAMERA_TUNABLES);
    }
  });

  it("resolves the generic levels to the bar, which is what they mean by the time a dialog is open", () => {
    expect(TRACKER_FOR_TRACKING_LEVEL.bar_path).toBe("bar");
    expect(TRACKER_FOR_TRACKING_LEVEL.full).toBe("bar");
  });
});
