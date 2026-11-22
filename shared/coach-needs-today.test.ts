import { describe, expect, it } from "vitest";
import { NOTHING_WAITING, needsLines, type NeedsYouToday } from "./coach-needs-today";

const ATHLETE_A = 11;
const ATHLETE_B = 12;
const TEAM = 3;
const THREE = 3;
const TWO = 2;

const none: NeedsYouToday = {
  date: "2026-11-18",
  sheetsWaiting: { count: 0, teamIds: [] },
  unreadMessages: { count: 0, athleteIds: [] },
  missingDocuments: { count: 0, athleteIds: [] },
  returningFromInjury: { count: 0, athletes: [] },
};

describe("needs you today lines", () => {
  it("draws nothing when nothing waits, and the quiet sentence is plain", () => {
    expect(needsLines(none)).toEqual([]);
    expect(NOTHING_WAITING).toBe("Nothing waiting on you.");
  });

  it("hides a zero line and keeps the order sheets, messages, documents, injury", () => {
    const lines = needsLines({
      ...none,
      sheetsWaiting: { count: 1, teamIds: [TEAM] },
      missingDocuments: { count: THREE, athleteIds: [ATHLETE_A, ATHLETE_B, 1] },
      returningFromInjury: { count: 1, athletes: [{ athleteId: ATHLETE_A, name: "Avery", startDate: "2026-11-20" }] },
    });
    expect(lines.map((l) => l.key)).toEqual(["sheets", "documents", "injury"]);
    expect(lines.map((l) => l.text)).toEqual([
      "1 printed sheet not logged yet",
      "3 athletes are missing a required document",
      "Avery starts a return-to-training plan this week",
    ]);
    expect(lines.map((l) => l.href)).toEqual(["/coach/weight-room", "/coach/athlete-documents", `/coach/roster/${ATHLETE_A}`]);
  });

  it("links one thread straight to it and several to the inbox", () => {
    const one = needsLines({ ...none, unreadMessages: { count: TWO, athleteIds: [ATHLETE_A] } });
    expect(one).toEqual([{ key: "messages", text: "2 unread messages", href: `/coach/messages?athlete=${ATHLETE_A}` }]);
    const many = needsLines({ ...none, unreadMessages: { count: 1, athleteIds: [ATHLETE_A, ATHLETE_B] } });
    expect(many[0].href).toBe("/coach/messages");
  });

  it("counts athletes on the injury line when there are several, and links the roster", () => {
    const [line] = needsLines({
      ...none,
      returningFromInjury: {
        count: TWO,
        athletes: [
          { athleteId: ATHLETE_A, name: "Avery", startDate: "2026-11-18" },
          { athleteId: ATHLETE_B, name: "Blake", startDate: "2026-11-19" },
        ],
      },
    });
    expect(line).toEqual({ key: "injury", text: "2 athletes start a return-to-training plan this week", href: "/coach/roster" });
  });

  it("uses no dash as sentence punctuation", () => {
    const all = needsLines({
      ...none,
      sheetsWaiting: { count: TWO, teamIds: [TEAM] },
      unreadMessages: { count: 1, athleteIds: [ATHLETE_A] },
      missingDocuments: { count: 1, athleteIds: [ATHLETE_A] },
      returningFromInjury: { count: 1, athletes: [{ athleteId: ATHLETE_A, name: "Avery", startDate: "2026-11-18" }] },
    });
    // A spaced hyphen, en dash or em dash used as punctuation: matches "a - b", not "return-to-training".
    // https://regex101.com/?regex=%20%5B-%E2%80%93%E2%80%94%5D%20&testString=a%20-%20b
    all.forEach((l) => expect(l.text).not.toMatch(/ [-–—] /));
  });
});
