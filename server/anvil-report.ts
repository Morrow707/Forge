import PDFDocument from "pdfkit";
import { ANVIL_WINDOW_CLOSES_MINUTES, ANVIL_WINDOW_OPENS_MINUTES, checkThatCounts, type AnvilWindowLabel } from "@shared/anvil-window";
import {
  fastChannelWeek,
  readSeries,
  type AnvilRawCheck,
  type AnvilReading,
} from "@shared/anvil-reading";
import { weeklyVerdict, type WeeklyVerdict } from "@shared/anvil-corroboration";
import { ANVIL_ACCURACY_CAVEAT, ANVIL_NOT_A_MEDICAL_TEST } from "@shared/anvil-agreement";
import {
  besideLine,
  coverageLine,
  fixableAcrossDays,
  fixableLine,
  type AnvilDayContext,
} from "@shared/anvil-day-context";
import type { AnvilCheck } from "@shared/schema";

/**
 * ASSEMBLING WHAT THE PERSON AND THEIR COACH ARE SHOWN, AND PRINTING IT.
 *
 * One module because the paper renders this module's own assembled output rather than re-querying:
 * a PDF that rebuilt the week from the database could disagree with the page a coach was looking
 * at when they pressed print, and a printed number that differs from the screen is the kind of
 * thing nobody can explain afterwards.
 *
 * NOTHING HERE DECIDES A NUMBER. Every z-score comes from `readSeries`, every threshold from
 * `shared/anvil-baseline.ts` and `anvil-part-metrics.ts`, and the only claim on the page comes
 * from `weeklyVerdict`, which refuses to make one on a single witness. This file's whole job is
 * shape: rows in, a package out.
 */

/** The DB row reduced to what the scoring functions read. Narrow on purpose -- `readCheck` must
 * not be able to reach a column the client never sees. */
export function anvilRawCheck(row: AnvilCheck): AnvilRawCheck {
  return {
    date: row.date,
    takenAt: row.takenAt.toISOString(),
    window: row.window as AnvilWindowLabel,
    trialsMs: row.trialsMs ?? [],
    omissions: row.omissions,
    rulesMissed: row.rulesMissed,
    sequenceBest: row.sequenceBest,
    tapCounts: row.tapCounts,
    partsRun: row.partsRun ?? [],
  };
}

/** What the person taking it gets: their own row, trials included. They own the trials and the
 * trial-by-trial strip is the one view that shows a lapse as a thing that happened rather than
 * as a count. */
export function anvilRowForClient(row: AnvilCheck) {
  return {
    id: row.id,
    date: row.date,
    takenAt: row.takenAt.toISOString(),
    window: row.window,
    trialsMs: row.trialsMs ?? [],
    omissions: row.omissions,
    rulesMissed: row.rulesMissed,
    goTrialsMs: row.goTrialsMs,
    sequenceBest: row.sequenceBest,
    tapCounts: row.tapCounts,
    partsRun: row.partsRun ?? [],
    timerResolutionMs: row.timerResolutionMs,
  };
}

export type AnvilDay = {
  id: number;
  date: string;
  takenAt: string;
  window: AnvilWindowLabel;
  /** True for the attempt that counts for its day -- the FIRST in-window one. */
  counts: boolean;
  reading: AnvilReading;
  /**
   * WHAT ELSE FORGE HAD ABOUT THAT MORNING, or null when nobody asked for it.
   *
   * Null is a real state and not a missing field: `assembleAnvilWeek` is pure and synchronous and
   * the context needs thirteen range queries, so the caller attaches it afterwards with
   * `attachDayContext`. A reader must therefore tell "this week was assembled without the context"
   * from "that morning had nothing beside it", and the second is a context with an empty `beside`
   * and a non-empty `coverage`. Collapsing the two would make a week nobody fetched the context
   * for look like a week in which the athlete logged nothing at all.
   */
  context: AnvilDayContext | null;
};

export type AnvilWeek = {
  athleteId: number;
  from: string;
  to: string;
  days: AnvilDay[];
  /** The fast channel's week: one witness, or why it has none. */
  fast: ReturnType<typeof fastChannelWeek>;
  /** The only place the Anvil asserts anything, and it will not on one witness. */
  verdict: WeeklyVerdict;
  /** Why the other two channels are absent, in words, so a blank is never read as a quiet week. */
  channelsNotBuilt: string[];
};

/**
 * The slow and career channels, stated rather than omitted.
 *
 * Neither is computable yet and the reasons are structural, not pending work: the slow channel
 * needs a fixed early-season anchor with training load regressed out, and nobody has an anchor;
 * the career channel needs the same athlete at the same age a year apart, and the Anvil is a day
 * old. `weeklyVerdict` is handed these as absences so that its `cannot_judge` reason names them
 * -- "nothing was wrong" and "nothing could be judged" must never render as the same blank.
 */
const SLOW_CHANNEL_ABSENT = "no early-season anchor on this account yet";
const CAREER_CHANNEL_ABSENT = "needs the same athlete at the same age a year earlier";

export function assembleAnvilWeek(
  athleteId: number,
  rowsOldestFirst: readonly AnvilCheck[],
  range: { from: string; to: string },
): AnvilWeek {
  // Scored against the WHOLE history and shown for the range. The baseline is twenty checks
  // wide, so trimming the rows before scoring would re-learn the athlete's normal from one week
  // and report `learning` for somebody who has been taking it for a month.
  const scored = readSeries(rowsOldestFirst.map(anvilRawCheck));
  const inRange = rowsOldestFirst
    .map((row, i) => ({ row, reading: scored[i].reading }))
    .filter(({ row }) => row.date >= range.from && row.date <= range.to);

  const countsByDate = new Map<string, number>();
  for (const date of new Set(inRange.map(({ row }) => row.date))) {
    const counting = checkThatCounts(inRange.filter(({ row }) => row.date === date).map(({ row }) => row));
    if (counting) countsByDate.set(date, counting.id);
  }

  const days: AnvilDay[] = inRange.map(({ row, reading }) => ({
    id: row.id,
    date: row.date,
    takenAt: row.takenAt.toISOString(),
    window: row.window as AnvilWindowLabel,
    counts: countsByDate.get(row.date) === row.id,
    reading,
    context: null,
  }));

  // The week is the days that COUNT. A second attempt is kept and shown and does not get a vote,
  // which is what makes "one attempt counts" true rather than a slogan.
  const counting = days.filter((d) => d.counts);
  const fast = fastChannelWeek(counting);
  return {
    athleteId,
    from: range.from,
    to: range.to,
    days,
    fast,
    verdict: weeklyVerdict([
      fast,
      { channel: "slow", absent: SLOW_CHANNEL_ABSENT },
      { channel: "career", absent: CAREER_CHANNEL_ABSENT },
    ]),
    channelsNotBuilt: [`slow: ${SLOW_CHANNEL_ABSENT}`, `career: ${CAREER_CHANNEL_ABSENT}`],
  };
}

/**
 * THE APP'S OWN DATA, ATTACHED TO THE MORNINGS IT BELONGS TO.
 *
 * Mutates nothing: a new week is returned with the same days carrying their context. It attaches
 * to EVERY day in the range rather than only the ones that count, because a second attempt and an
 * out-of-window check are both shown and a coach reading one of those rows wants the same facts
 * beside it as the row above.
 *
 * A day with no entry in `byDate` keeps `context: null` -- the "nobody asked" state the field's
 * own comment describes -- so a partial fetch degrades to the week as it was rather than to a week
 * that silently claims every athlete logged nothing.
 */
export function attachDayContext(week: AnvilWeek, byDate: Map<string, AnvilDayContext>): AnvilWeek {
  return {
    ...week,
    days: week.days.map((day) => ({ ...day, context: byDate.get(day.date) ?? day.context })),
  };
}

/** `days` back from `today`, inclusive of both ends. */
export function anvilRange(todayIso: string, days: number): { from: string; to: string } {
  const to = todayIso;
  const from = new Date(Date.parse(`${todayIso}T00:00:00Z`) - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

export type AnvilRosterWeek = {
  from: string;
  to: string;
  athletes: Array<{
    athleteId: number;
    athleteName: string;
    week: AnvilWeek;
  }>;
  /** Athletes with no check at all in the range, named rather than silently missing: a quiet
   * roster and a roster nobody has set up look identical otherwise. */
  noChecks: Array<{ athleteId: number; athleteName: string }>;
};

// ---------------------------------------------------------------------------
// The paper.
// ---------------------------------------------------------------------------

/**
 * THE WEEKLY PRINTOUT. One page of roster, one block per athlete.
 *
 * Deliberately plain, like the compliance snapshot and unlike the branded athlete-facing PDFs:
 * this is a working document a coach prints or forwards, and the accuracy caveat on it has to be
 * the first thing read rather than a footer under a logo.
 *
 * **IT CARRIES THE SAME CAVEAT EVERY CAMERA NUMBER CARRIES.** Nothing in the Anvil is calibrated
 * and a printed number outlives the screen it came from -- a page that leaves the building with
 * no caveat on it is the one place the warning cannot be attached afterwards.
 */
export function buildAnvilWeekPdf(data: {
  week: AnvilRosterWeek;
  coachName: string;
  generatedAt?: Date;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const generatedAt = data.generatedAt ?? new Date();

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#000000").text("The Anvil -- weekly summary");
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#444444")
      .text(
        `${data.coachName}  ·  ${data.week.from} to ${data.week.to}  ·  generated ${generatedAt.toISOString()}`,
      );
    doc.moveDown(0.5);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#444444")
      .text(ANVIL_ACCURACY_CAVEAT, { width });
    doc.moveDown(0.3);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor("#444444")
      .text(
        "Every figure below is one person compared with their own earlier mornings, never with " +
          // RENDERED, never re-typed: shared/anvil-agreement.ts is the one place that sentence
          // lives, and the vocabulary sweep over this file is what enforces it.
          `another athlete. ${ANVIL_NOT_A_MEDICAL_TEST} The morning window is ` +
          `${minutesLabel(ANVIL_WINDOW_OPENS_MINUTES)} to ${minutesLabel(ANVIL_WINDOW_CLOSES_MINUTES)} ` +
          "local; a check taken outside it is kept, shown and left out of that person's normal.",
        { width },
      );

    for (const entry of data.week.athletes) {
      if (doc.y > doc.page.height - 200) doc.addPage();
      doc.moveDown(1).font("Helvetica-Bold").fontSize(12).fillColor("#000000").text(entry.athleteName);
      doc
        .moveTo(doc.x, doc.y + 2)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
        .strokeColor("#000000")
        .stroke();
      doc.moveDown(0.4);

      doc.font("Helvetica-Bold").fontSize(10).text(verdictSentence(entry.week));
      doc.moveDown(0.2);

      doc.font("Helvetica").fontSize(9).fillColor("#000000");
      for (const day of entry.week.days) {
        doc.font("Helvetica").fontSize(9).fillColor("#000000").text(dayLine(day), { indent: 10 });
        // WHAT ELSE FORGE HAD ABOUT THAT MORNING, under the morning it belongs to. Facts, in the
        // units they are stored in, and never a cause: the week's one claim is the line above and
        // `weeklyVerdict` will not make it on a single witness.
        const beside = day.context ? besideLine(day.context) : "";
        if (beside) {
          doc.font("Helvetica").fontSize(8).fillColor("#555555").text(`beside it:  ${beside}`, { indent: 22 });
        }
        if (day.context) {
          doc
            .font("Helvetica")
            .fontSize(7)
            .fillColor("#777777")
            .text(`read ${coverageLine(day.context)}`, { indent: 22 });
        }
      }

      // A BLANK SOMEBODY CAN CLOSE SAYS SO -- ONCE PER ATHLETE. Under each morning it printed the
      // same five sentences seven times, which on paper is worse than on screen: a page of
      // repeated amber is skipped, and these are the lines a coach is meant to act on.
      const fixable = fixableAcrossDays(
        entry.week.days.map((d) => d.context).filter((c): c is AnvilDayContext => c != null),
      );
      for (const fix of fixable) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(8)
          .fillColor("#555555")
          .text(fixableLine(fix), { indent: 10, width: width - 10 });
      }
      if (entry.week.days.length === 0) {
        doc.font("Helvetica-Oblique").text("No check taken this week.", { indent: 10 });
      }
    }

    if (data.week.noChecks.length > 0) {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(1).font("Helvetica-Bold").fontSize(12).fillColor("#000000").text("No check this week");
      doc.moveDown(0.3);
      doc
        .font("Helvetica")
        .fontSize(9)
        .text(data.week.noChecks.map((a) => a.athleteName).join(", "), { width });
    }

    doc.end();
  });
}

/** 05:40 from 340. */
export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * ONE DAY, IN WORDS, AND IT STATES THE NUMBER AND NEVER A VERDICT.
 *
 * This is the daily VIEW Scott asked for, on paper. A daily claim at the corroboration threshold
 * would fire about 16.9 times per athlete per season on noise alone -- measured, 3,000 simulated
 * pure-noise seasons -- so the daily line reports where the morning sat against that person's own
 * band and stops there. The week is where anything is asserted.
 */
export function dayLine(day: AnvilDay): string {
  const n = day.reading.numbers;
  const bits: string[] = [`${day.date}`];
  bits.push(n.medianMs == null ? "no trials" : `${Math.round(n.medianMs)} ms`);
  const c = day.reading.comparison;
  if (c.kind === "compared") {
    const sign = c.medianZ >= 0 ? "+" : "";
    bits.push(`${sign}${c.medianZ.toFixed(2)} SD vs own normal`);
    bits.push(`${c.lapses} slow ${c.lapses === 1 ? "trial" : "trials"}`);
  } else if (c.kind === "learning") {
    bits.push(`learning their normal (${c.have} of ${c.need} mornings)`);
  } else {
    bits.push("no spread in their own history to compare against");
  }
  if (n.sequenceBest != null) bits.push(`span ${n.sequenceBest}`);
  if (n.tapCount != null) bits.push(`${n.tapCount} taps`);
  if (n.rulesMissed != null) bits.push(`${n.rulesMissed} missed`);
  if (day.window !== "in_window") bits.push(day.window === "practice" ? "practice run" : "outside the morning window");
  if (!day.counts && day.window === "in_window") bits.push("second attempt, does not count");
  return bits.join("  ·  ");
}

/** The week's one claim, or the honest inability to make one. */
export function verdictSentence(week: AnvilWeek): string {
  if (week.verdict.kind === "finding") {
    return `Week: a change showed up on ${week.verdict.witnesses.join(" and ")} (${week.verdict.z.toFixed(2)} SD on the weaker of them). Worth a conversation.`;
  }
  if (week.verdict.kind === "quiet") {
    return "Week: nothing stood out.";
  }
  return `Week: not enough to judge on -- ${week.verdict.reason}.`;
}
