// 0=Sun..6=Sat, matching JS Date#getDay() and the server's own
// trainingWeekdays convention (see storage.getProgramSchedule). Shared by
// every "which days do you train" picker -- the coach's roster-assign
// dialog and every self-assign dialog (admin/coach/athlete's own).
export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Su" },
  { value: 1, label: "Mo" },
  { value: 2, label: "Tu" },
  { value: 3, label: "We" },
  { value: 4, label: "Th" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
];
