// 0=Sun..6=Sat, matching JS Date#getDay() and the server's own
// trainingWeekdays convention (see storage.getProgramSchedule). Shared by
// the server's trainingWeekdays parameter, which is still live on
// GET /programs/:id/schedule and POST /assignments.
//
// NO CLIENT PICKER READS THIS TODAY. Scott, 2026-10-02: "It should be per day, day one
// is what day, day two is what day". Both scheduling screens now set every day's date
// explicitly instead of inferring the rest from a weekly pattern, so the pickers that
// used these labels are gone. Kept because the server parameter it mirrors is unchanged
// and this is where the 0=Sun..6=Sat convention is written down.
export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Su" },
  { value: 1, label: "Mo" },
  { value: 2, label: "Tu" },
  { value: 3, label: "We" },
  { value: 4, label: "Th" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
];
