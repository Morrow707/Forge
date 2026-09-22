import { useState } from "react";
import { FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentsRequiredDialog, useDocumentGate } from "@/components/document-gate";

/** THE FIRST THING THEY SEE WHEN THEY STILL OWE PAPERWORK.
 *
 * Scott, 2026-09-22: "give them a warning when they first login, telling them documents aren't
 * done". Shown on every visit to the dashboard rather than once, because it is not a tip -- it
 * is the reason the rest of the app will refuse them, and something they dismissed on Tuesday
 * does not explain a locked button on Friday.
 *
 * Silent while the answer is unknown and silent once the paperwork is done, so an account in
 * good standing never sees it at all.
 */
export function DocumentsOutstandingBanner() {
  const { blocked, missing } = useDocumentGate();
  const [open, setOpen] = useState(false);
  if (blocked !== true) return null;
  return (
    <>
      <Card className="mb-6 border-primary/40">
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <FileWarning className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Your documents aren't done yet</p>
            <p className="text-sm text-muted-foreground">
              Look around as much as you like -- training, skills and the camera stay locked
              until {missing.length === 1 ? "one form is" : `${missing.length} forms are`} on
              file.
            </p>
          </div>
          <Button type="button" className="shrink-0" onClick={() => setOpen(true)}>
            See what's missing
          </Button>
        </CardContent>
      </Card>
      <DocumentsRequiredDialog open={open} onOpenChange={setOpen} missing={missing} />
    </>
  );
}
