import PDFDocument from "pdfkit";
import { csvField } from "./training-history-export";

const ACTIVITY_LABEL: Record<string, string> = {
  training: "Training",
  meeting: "Team Meeting",
  film_review: "Film Review",
  travel: "Travel",
  other: "Other",
};

const END_REASON_LABEL: Record<string, string> = {
  completed: "Completed",
  idle_timeout: "Auto-closed (idle)",
  manual_stop: "Manually stopped",
};

export interface CaraExportSession {
  athleteId: number;
  athleteName: string;
  activityType: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  loggedByCoachId: number | null;
  note: string | null;
}

function durationMinutes(s: CaraExportSession): number {
  const end = s.endedAt ?? new Date();
  return Math.round(Math.max(0, end.getTime() - s.startedAt.getTime()) / 60_000);
}

function fmtDateTime(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export function buildCaraComplianceCsv(sessions: CaraExportSession[]): string {
  const header = [
    "Athlete",
    "Activity Type",
    "Start",
    "End",
    "Duration (min)",
    "Status",
    "Logged By",
    "Note",
  ];
  const lines = [header.join(",")];
  for (const s of sessions) {
    lines.push(
      [
        csvField(s.athleteName),
        csvField(ACTIVITY_LABEL[s.activityType] ?? s.activityType),
        csvField(fmtDateTime(s.startedAt)),
        csvField(s.endedAt ? fmtDateTime(s.endedAt) : "Still open"),
        csvField(durationMinutes(s)),
        csvField(s.endReason ? END_REASON_LABEL[s.endReason] ?? s.endReason : "In progress"),
        csvField(s.loggedByCoachId ? "Manual (coach-logged)" : "Auto-tracked"),
        csvField(s.note),
      ].join(","),
    );
  }
  return lines.join("\n");
}

const ORANGE = "#F65B23";
const DARK = "#111111";
const GREY = "#666666";

export interface CaraWeekRow {
  weekStart: Date;
  weekEnd: Date;
  athletes: { athleteId: number; name: string; minutes: number; overCap: boolean; atRisk: boolean }[];
}

/** NCAA-style countable-hours audit document -- a weekly totals-vs-cap
 * summary table up front (what an auditor checks first), then the full
 * session-level detail log behind it (what backs up that summary if
 * questioned). Every number here comes straight from caraSessions; nothing
 * is estimated or rounded until the final display step. */
export function buildCaraCompliancePdf(data: {
  coachName: string;
  from: Date;
  to: Date;
  capMinutes: number;
  weeks: CaraWeekRow[];
  sessions: CaraExportSession[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageBottom = doc.page.height - doc.page.margins.bottom;

    doc.rect(0, 0, doc.page.width, 90).fill(ORANGE);
    doc.fillColor("#ffffff").fontSize(24).font("Helvetica-Bold").text("FORGE", 50, 30);
    doc.fontSize(10).font("Helvetica").text("CARA Time-Log Compliance Report", 50, 60);

    doc.moveDown(3);
    doc.fillColor(DARK).fontSize(16).font("Helvetica-Bold").text(data.coachName);
    doc
      .fillColor(GREY)
      .fontSize(10)
      .font("Helvetica")
      .text(
        `${data.from.toISOString().slice(0, 10)} to ${data.to.toISOString().slice(0, 10)} -- weekly cap ${(data.capMinutes / 60).toFixed(1)} hours`,
      );
    doc.moveDown(1);

    doc.fillColor(ORANGE).fontSize(13).font("Helvetica-Bold").text("Weekly Totals vs. Cap");
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(ORANGE).stroke();
    doc.moveDown(0.4);

    if (data.weeks.every((w) => w.athletes.length === 0)) {
      doc.fillColor(GREY).fontSize(10).font("Helvetica").text("No CARA activity logged in this range.");
    }

    for (const week of data.weeks) {
      if (week.athletes.length === 0) continue;
      if (doc.y > pageBottom - 60) doc.addPage();
      doc
        .fillColor(DARK)
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(`Week of ${week.weekStart.toISOString().slice(0, 10)}`);
      for (const a of week.athletes) {
        if (doc.y > pageBottom - 20) doc.addPage();
        const flag = a.overCap ? " -- OVER CAP" : a.atRisk ? " -- at risk" : "";
        doc
          .fillColor(a.overCap ? "#B91C1C" : DARK)
          .fontSize(10)
          .font("Helvetica")
          .text(`  ${a.name}: ${(a.minutes / 60).toFixed(1)}h${flag}`);
      }
      doc.moveDown(0.4);
    }

    doc.addPage();
    doc.fillColor(ORANGE).fontSize(13).font("Helvetica-Bold").text("Session Detail Log");
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor(ORANGE).stroke();
    doc.moveDown(0.4);

    if (data.sessions.length === 0) {
      doc.fillColor(GREY).fontSize(10).font("Helvetica").text("No sessions logged in this range.");
    }

    const byAthlete = new Map<string, CaraExportSession[]>();
    for (const s of data.sessions) {
      if (!byAthlete.has(s.athleteName)) byAthlete.set(s.athleteName, []);
      byAthlete.get(s.athleteName)!.push(s);
    }

    for (const [athleteName, sessions] of byAthlete) {
      if (doc.y > pageBottom - 50) doc.addPage();
      doc.moveDown(0.6);
      doc.fillColor(DARK).fontSize(12).font("Helvetica-Bold").text(athleteName);
      for (const s of sessions) {
        if (doc.y > pageBottom - 20) doc.addPage();
        const end = s.endedAt ? fmtDateTime(s.endedAt) : "still open";
        const line = `${fmtDateTime(s.startedAt)} -> ${end}  (${durationMinutes(s)} min)  ${ACTIVITY_LABEL[s.activityType] ?? s.activityType}${s.loggedByCoachId ? " [manual]" : ""}`;
        doc.fillColor(GREY).fontSize(9).font("Helvetica").text(line, 60);
        if (s.note) doc.fillColor(GREY).fontSize(8).font("Helvetica-Oblique").text(s.note, 70);
      }
    }

    doc.end();
  });
}
