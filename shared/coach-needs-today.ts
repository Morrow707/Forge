/* "NEEDS YOU TODAY" ON THE COACH DASHBOARD'S TODAY CARD (2026-11-22). Four counts, each a line
 * that links to the screen that resolves it. Pure, so the server, the card and a unit test share
 * one set of sentences. The reads are in server/coach-needs-today.ts.
 *
 * Decisions, so nobody re-derives them:
 *   - SHEETS WAITING are PRINTED sheets with no logged upload yet for the same team, date and
 *     program day, printed for a date in the last week up to today. Reading a photo writes
 *     nothing on the server (POST /api/coach/weight-room/sheets/read returns a draft), so "read
 *     but not logged" cannot be told apart from "never read"; a printed sheet with nothing logged
 *     against it is the honest version.
 *   - UNREAD MESSAGES are messages from athletes in this coach's own threads, read as unread by
 *     the same rule the Messages page uses.
 *   - MISSING DOCUMENTS counts ATHLETES, not documents, on the active roster (held athletes out).
 *   - COMING BACK FROM INJURY counts athletes whose return-to-training assignment (a program
 *     tagged return_to_training, from this program's staff) starts this week, Monday to Sunday.
 *   - A line with zero is not drawn. All zero is one quiet sentence. A failed read is the card's
 *     ReadFailed, never this sentence. */

export type NeedsYouToday = {
  date: string;
  sheetsWaiting: { count: number; teamIds: number[] };
  unreadMessages: { count: number; athleteIds: number[] };
  missingDocuments: { count: number; athleteIds: number[] };
  returningFromInjury: { count: number; athletes: Array<{ athleteId: number; name: string; startDate: string }> };
};

export type NeedsLine = { key: "sheets" | "messages" | "documents" | "injury"; text: string; href: string };

export const NOTHING_WAITING = "Nothing waiting on you.";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The lines to draw, in order. Zero-count lines are left out; an empty array means nothing waits. */
export function needsLines(n: NeedsYouToday): NeedsLine[] {
  const lines: NeedsLine[] = [];
  if (n.sheetsWaiting.count > 0) {
    lines.push({
      key: "sheets",
      text: `${plural(n.sheetsWaiting.count, "printed sheet", "printed sheets")} not logged yet`,
      href: "/coach/weight-room",
    });
  }
  if (n.unreadMessages.count > 0) {
    const only = n.unreadMessages.athleteIds.length === 1 ? n.unreadMessages.athleteIds[0] : null;
    lines.push({
      key: "messages",
      text: plural(n.unreadMessages.count, "unread message", "unread messages"),
      href: only != null ? `/coach/messages?athlete=${only}` : "/coach/messages",
    });
  }
  if (n.missingDocuments.count > 0) {
    lines.push({
      key: "documents",
      text: `${plural(n.missingDocuments.count, "athlete is", "athletes are")} missing a required document`,
      href: "/coach/athlete-documents",
    });
  }
  if (n.returningFromInjury.count > 0) {
    const only = n.returningFromInjury.athletes.length === 1 ? n.returningFromInjury.athletes[0] : null;
    lines.push({
      key: "injury",
      text: only
        ? `${only.name} starts a return-to-training plan this week`
        : `${plural(n.returningFromInjury.count, "athlete starts", "athletes start")} a return-to-training plan this week`,
      href: only ? `/coach/roster/${only.athleteId}` : "/coach/roster",
    });
  }
  return lines;
}
