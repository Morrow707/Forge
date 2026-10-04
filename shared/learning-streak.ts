/** Pure: the learning streak over a set of YYYY-MM-DD days, judged at `now` (UTC). */
export function learningStreakFromDays(days: Set<string>, now: Date) {
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  const nextDay = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() + 86_400_000).toISOString().slice(0, 10);
  for (const d of sorted) {
    run = prev && nextDay(prev) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const last = sorted[sorted.length - 1];
  const current = last === today || last === yesterday ? run : 0;
  return { current, longest, activeToday: last === today };
}
