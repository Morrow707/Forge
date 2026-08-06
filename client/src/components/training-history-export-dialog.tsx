import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { shareOrDownloadFile } from "@/lib/share-file";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";

interface TrainingHistoryExportDialogProps {
  athleteName: string;
  csvUrl: string;
  pdfUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Shared by the coach roster (per-athlete) and the athlete's own progress
 * page (self) -- both just point it at their respective export routes,
 * which return the same flattened set-level history for the requester. */
export function TrainingHistoryExportDialog({
  athleteName,
  csvUrl,
  pdfUrl,
  open,
  onOpenChange,
}: TrainingHistoryExportDialogProps) {
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);

  async function handleDownload(format: "csv" | "pdf") {
    setDownloading(format);
    try {
      const safeName = athleteName.replace(/[^a-z0-9]+/gi, "-");
      await shareOrDownloadFile(
        format === "csv" ? csvUrl : pdfUrl,
        `${safeName}-training-history.${format}`,
        `${athleteName}'s Training History`,
      );
      onOpenChange(false);
    } catch {
      toast.error("Couldn't generate that export");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export Training History</DialogTitle>
          <DialogDescription>
            Every logged workout for {athleteName}, in your choice of format.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="justify-start"
            disabled={downloading !== null}
            onClick={() => handleDownload("csv")}
          >
            <FileSpreadsheet className="h-4 w-4" />
            {downloading === "csv" ? "Generating..." : "Download as CSV"}
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={downloading !== null}
            onClick={() => handleDownload("pdf")}
          >
            <FileText className="h-4 w-4" />
            {downloading === "pdf" ? "Generating..." : "Download as PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
