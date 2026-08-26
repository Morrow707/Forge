// Client-side counterpart to server/training-history-export.ts's csvField --
// same CSV-injection escaping (a leading =/+/-/@ gets interpreted as a
// formula by Excel/Sheets), needed here because roster exports are built
// entirely from data already loaded in the browser rather than round-
// tripping to a server route.
export function csvField(value: string | number | null | undefined): string {
  let str = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return lines.join("\n");
}
