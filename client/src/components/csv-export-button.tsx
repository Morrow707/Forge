/* "Export CSV" for a coach's report cards (2026-11-21). Every report a coach can read on screen
 * can be taken to a spreadsheet, built from the rows the card already loaded (no second request,
 * so the file is exactly what was on screen). `note` puts a first line above the header, which is
 * how a file carrying camera numbers keeps the accuracy caveat once it leaves the app: a CSV has no
 * other place to say it, and a camera number without its caveat is the thing
 * shared/camera-accuracy-copy.ts exists to prevent. */
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, csvField } from "@/lib/csv";
import { shareOrDownloadBlob } from "@/lib/share-file";

export type CsvCell = string | number | null | undefined;

export function buildCsvExport(header: string[], rows: CsvCell[][], note?: string): string {
  const body = toCsv(header, rows);
  return note ? `${csvField(note)}\n${body}` : body;
}

export function CsvExportButton({
  filename,
  header,
  rows,
  note,
  testId,
}: {
  filename: string;
  header: string[];
  rows: CsvCell[][];
  note?: string;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={rows.length === 0}
      data-testid={testId ?? "button-export-csv"}
      onClick={() => {
        const blob = new Blob([buildCsvExport(header, rows, note)], { type: "text/csv" });
        void shareOrDownloadBlob(blob, filename, "Export");
      }}
    >
      <Download className="h-4 w-4 mr-1.5" />
      CSV
    </Button>
  );
}
