/** THE FOUR MOVEMENTS FORGE'S CAMERA TRACKING HAS ACTUALLY BEEN VALIDATED ON.
 *
 * Deliberately four and not forty. The obvious version of a movement library is a page per
 * exercise in the whole library, each showing a skeleton overlay and some coaching cues -- which
 * would mean publishing, at scale and under our own name, confident-looking output for movements
 * nobody has checked. Eight tracked modes are unvalidated (see docs/camera-tracking-notes.md);
 * a page each would be eight pages of invented authority.
 *
 * So this list is the validated set, and it grows when the validation does. The order in
 * camera-tracking-notes.md is deadlift, then med ball, then Olympic lifts -- and Olympic lifts
 * need their own path model first, which is why they are absent rather than merely untested.
 *
 * Everything in here is drawn from that file. If the two disagree, that file is right.
 */

export type Movement = {
  slug: string;
  name: string;
  mode: string;
  /** How to set the camera up. The single most useful thing on the page. */
  filming: string;
  /** What Forge measures on this movement. */
  measures: string[];
  /** What is NOT reliable here, named specifically. Every entry must have at least one. */
  caveat: string;
};

export const MOVEMENTS: Movement[] = [
  {
    slug: "back-squat",
    name: "Back squat",
    mode: "Bar path",
    filming:
      "Phone on the floor or a low box, landscape, about three metres back, with the whole athlete in frame from head to feet at the bottom of the rep. Behind the lifter is what has been tested.",
    measures: [
      "Bar speed on the way up, per rep and across the set",
      "Depth, as range of motion",
      "Bar path deviation from vertical",
      "How much the bar slowed from the first rep to the last",
    ],
    caveat:
      "Filming from behind means forward-and-back drift lands on the depth axis, which a single camera estimates rather than measures -- so it is the least reliable number in the set. Side-on gives a better answer to that specific question and a worse one to everything else.",
  },
  {
    slug: "bench-press",
    name: "Bench press",
    mode: "Bar path",
    filming:
      "Any angle you can film from is an angle Forge will measure -- see the caveat for what each one costs. Square to the side, camera level with the bar, is the most accurate, because it is the only view where a lying athlete's own height can be used to set real-world scale. From the foot of the bench or behind the head, scale comes from shoulder breadth instead, which works from those angles and is looser.",
    measures: [
      "Bar speed through the press",
      "Range of motion from chest to lockout",
      "Bar path deviation and tilt between the two arms",
      "Rep count and tempo",
    ],
    caveat:
      "Bench is the only lift Forge tracks where the athlete is lying down, and that costs it a ruler. A lying body shows its true length only when it lies ACROSS the frame; filmed from the foot of the bench or behind the head it points at the lens, so height cannot be read and scale falls to shoulder breadth alone. Shoulder breadth is a population average against height and can be out by around a tenth on build alone, so distances -- range of motion above all -- are the numbers to treat with most suspicion from those angles. The set is still measured and still reported; it is a wider error bar, not a refusal.",
  },
  {
    slug: "pendlay-row",
    name: "Pendlay row",
    mode: "Bar path",
    filming:
      "Side-on, low, the full bar path in frame from the floor to the athlete's chest. The dead stop on the floor between reps is what makes this one segment cleanly.",
    measures: [
      "Bar speed on the pull",
      "Range of motion floor to chest",
      "Bar path deviation",
      "Rep count and rep-to-rep consistency",
    ],
    caveat:
      "The bar starting at rest on the floor is what makes rep segmentation reliable here. A row done with a bounce or without a full reset gives the segmenter a much harder problem, and rep counts get less trustworthy the further the lift drifts from a true dead stop.",
  },
  {
    slug: "box-jump",
    name: "Box jump",
    mode: "Jump",
    filming:
      "Side-on, far enough back that the athlete and the whole box stay in frame at the top of the jump. Landscape, and keep the phone still -- this mode reads the box's top edge out of the footage.",
    measures: [
      "Jump height",
      "Horizontal distance travelled",
      "Time on the ground between reps",
      "Reactive strength index",
    ],
    caveat:
      "Height is measured against the box's top surface, found by the tracker in the footage. A box that blends into the floor, a cluttered background behind it, or a box partly out of frame all make that read fail -- and when it does, the set is saved with a note saying so rather than reported with a number nobody should trust.",
  },
];

export function movementBySlug(slug: string): Movement | undefined {
  return MOVEMENTS.find((m) => m.slug === slug);
}
