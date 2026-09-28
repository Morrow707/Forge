/**
 * THE EQUIPMENT VOTES ON WHERE THE BAR IS -- ONCE IT HAS EARNED THE RIGHT TO.
 *
 * Scott, 2026-09-28, after a back squat against a bar sensor: "For the barbell back squat let's
 * track the bar too and the plates, will only help boost accuracy on faulty body detectors."
 *
 * Until now a barbell lift asked the object detector for the plate (and the bar as a second
 * class) and used the boxes for ONE thing: real-world scale. The bar's position on every frame
 * came from the wrists and the motion-diff tracker alone, so a frame where the body tracker lost
 * a wrist, or put it somewhere impossible, produced no point at all -- and the frames a body
 * tracker loses are the ones at the bottom of a squat, where the hands sit behind the head and
 * the bar is the only thing still plainly in view.
 *
 * This is the third part of the architecture in CLAUDE.md doing its job: the object tracker
 * says where the equipment is, the body tracker says where the athlete is, and neither is
 * believed on its own. The rules:
 *
 * - THE EQUIPMENT ONLY FILLS A HOLE. On a frame where the hands produced a point that passed
 *   the plausibility gate, the hands win and the equipment is used to LEARN, not to vote.
 *   Blending would change the number on every calibrated take to fix the frames on a few.
 * - IT EARNS THE VOTE BY AGREEING WITH THE HANDS. The offset from the equipment's box centre
 *   to the hands' bar point is recorded on every frame that has both. Only once there are
 *   enough of them, and they agree with each other to within a fraction of the athlete's grip
 *   width, is the median offset trusted to turn a box into a bar point. A lock on a plate on
 *   the rack behind the lifter never agrees with the hands for long, so it never votes.
 * - THE THRESHOLD IS IN GRIP WIDTHS, never pixels or metres -- see CLAUDE.md. Grip width is
 *   measured on the same take, in the same units as the points, and scales with the camera
 *   exactly as the scene does.
 * - A SUBSTITUTED POINT GOES THROUGH THE SAME SPEED GATE as a hand-built one. A jumped
 *   detection is dropped as a sample the same way a jumped wrist is.
 * - VERTICAL IS WHAT THE OFFSET IS FOR. A plate on the bar sits at bar height, and its
 *   horizontal distance from the hands is fixed for the set; the learned offset carries both,
 *   so a substituted point means the same thing as a measured one (the middle of the bar) and
 *   the trace does not step sideways when the source changes.
 */

export type EquipmentPoint = { x: number; y: number; confidence: number };

/** Frames on which the equipment and the hands must both have been seen, and agreed, before
 *  the equipment may fill a frame the hands missed. Half a second at the analysis stride. */
export const MIN_EQUIPMENT_AGREEMENT_FRAMES = 15;

/** How much the equipment-to-hands offset may wander (median absolute deviation, in grip
 *  widths) before the equipment is judged to be locked on something the athlete is not
 *  holding. A quarter of a grip is generous for a bar in the hands and far too tight for a
 *  plate on a rack while the athlete squats past it. An admitted guess; recorded on every
 *  take as `equipmentOffsetSpreadGrips` so it can be revised from evidence. */
export const MAX_EQUIPMENT_OFFSET_SPREAD_GRIPS = 0.25;

/** A substituted point is not a measured one. Same discount idea as a lone hand carried to
 *  the middle of the bar. */
export const EQUIPMENT_POINT_CONFIDENCE_FACTOR = 0.8;

type Box = { x: number; y: number; width: number; height: number; confidence: number; held?: true };

/**
 * Which detector box, if any, may speak for the bar's position on this frame.
 *
 * The bar itself is the better witness (its centre IS the bar) and is asked for first; a plate
 * is the fallback, because it sits at bar height and is the class the detector actually finds.
 * A `held` box is the last real box repeated on a frozen frame -- not a reading -- and is never
 * used. Which slot each class is in depends on the tracking mode, and a bar is a bar whichever
 * slot it arrived in, so this looks at the label, not the slot.
 */
export function equipmentBoxForBarPath(
  frame: { coreMlImplement?: Box; coreMlSecondary?: Box & { label: string } },
  trackingMode: string | undefined,
  minConfidence: number,
): { box: Box; label: "barbell" | "plate" } | null {
  if (trackingMode !== "plate" && trackingMode !== "barbell") return null;
  const primaryLabel = trackingMode;
  const candidates: { box: Box | undefined; label: string | undefined }[] = [
    { box: frame.coreMlImplement, label: primaryLabel },
    { box: frame.coreMlSecondary, label: frame.coreMlSecondary?.label },
  ];
  const usable = (c: { box: Box | undefined }) => c.box && !c.box.held && c.box.confidence >= minConfidence;
  const bar = candidates.find((c) => c.label === "barbell" && usable(c));
  if (bar?.box) return { box: bar.box, label: "barbell" };
  const plate = candidates.find((c) => c.label === "plate" && usable(c));
  if (plate?.box) return { box: plate.box, label: "plate" };
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Learns the offset from the equipment box to the hands' bar point, and hands out a bar point
 * for a frame where only the equipment was seen -- once the offset has been shown to be stable.
 */
export class EquipmentOffsetLearner {
  private readonly dx: number[] = [];
  private readonly dy: number[] = [];
  private substitutions = 0;
  private lastLabel: "barbell" | "plate" | null = null;

  /** A frame where both the hands and the equipment produced a point. */
  observe(equipment: EquipmentPoint, hands: { x: number; y: number }, label: "barbell" | "plate"): void {
    this.dx.push(hands.x - equipment.x);
    this.dy.push(hands.y - equipment.y);
    this.lastLabel = label;
  }

  get agreementFrames(): number {
    return this.dy.length;
  }

  get substitutedFrames(): number {
    return this.substitutions;
  }

  get label(): "barbell" | "plate" | null {
    return this.lastLabel;
  }

  /** Median absolute deviation of the vertical offset, in grip widths. Null until there is
   *  something to measure against. */
  offsetSpreadGrips(gripWidthUnits: number | null): number | null {
    if (this.dy.length === 0 || gripWidthUnits == null || gripWidthUnits <= 0) return null;
    const m = median(this.dy);
    const mad = median(this.dy.map((v) => Math.abs(v - m)));
    return mad / gripWidthUnits;
  }

  /** Whether the equipment has agreed with the hands long enough, and closely enough, to be
   *  allowed to speak for them. */
  ready(gripWidthUnits: number | null): boolean {
    if (this.dy.length < MIN_EQUIPMENT_AGREEMENT_FRAMES) return false;
    const spread = this.offsetSpreadGrips(gripWidthUnits);
    return spread != null && spread <= MAX_EQUIPMENT_OFFSET_SPREAD_GRIPS;
  }

  /** The bar point this box implies, or null when the equipment has not earned the vote.
   *  The caller still runs it through the speed gate. */
  substitute(equipment: EquipmentPoint, gripWidthUnits: number | null): EquipmentPoint | null {
    if (!this.ready(gripWidthUnits)) return null;
    this.substitutions++;
    return {
      x: equipment.x + median(this.dx),
      y: equipment.y + median(this.dy),
      confidence: equipment.confidence * EQUIPMENT_POINT_CONFIDENCE_FACTOR,
    };
  }
}
