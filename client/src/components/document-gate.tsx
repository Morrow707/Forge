import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";

export type DocumentCompliance = {
  audience: string;
  complete: boolean;
  missing: { kind: string; label: string; why: string }[];
};

/** MAY THIS ACCOUNT TRAIN YET?
 *
 * Answered by the server, never derived here -- two copies of this rule disagree silently, and
 * the disagreement is only ever visible to the person it strands.
 *
 * `undefined` while the answer is unknown, and every caller must require an explicit `false`
 * before it blocks anything. Defaulting to blocked flashes a wall at somebody whose paperwork
 * is fine; defaulting to allowed lets the first tap through, which is the thing this exists to
 * stop. Same convention as useCameraAccess and useSkillsAccess.
 */
export function useDocumentGate(): {
  blocked: boolean | undefined;
  missing: DocumentCompliance["missing"];
} {
  const { user } = useAuth();
  const { data } = useQuery<DocumentCompliance>({
    queryKey: ["/api/account/document-compliance"],
    // Only an athlete is gated today. A coach's credentials matter just as much, but locking a
    // coach out of their own roster mid-season is a different decision with a different blast
    // radius, and it has not been made.
    enabled: user?.role === "athlete",
  });
  if (user?.role !== "athlete") return { blocked: false, missing: [] };
  if (!data) return { blocked: undefined, missing: [] };
  return { blocked: !data.complete, missing: data.missing };
}

/** The wall, with the way through it.
 *
 * Names each outstanding document rather than saying "some documents are missing" -- somebody
 * who does not know WHICH form is missing cannot go and get it. The button navigates; it is not
 * decoration, and there is a test that says so.
 */
export function DocumentsRequiredDialog({
  open,
  onOpenChange,
  missing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missing: DocumentCompliance["missing"];
}) {
  const [, navigate] = useLocation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <FileWarning className="h-7 w-7 text-primary" />
          <DialogTitle>Finish your documents first</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>
                You can look around Forge, but training, skills and the camera stay locked until
                these are on file.
              </p>
              <ul className="space-y-2">
                {missing.map((doc) => (
                  <li key={doc.kind} className="rounded-md border border-border p-2.5">
                    <p className="font-semibold text-foreground">{doc.label}</p>
                    <p className="text-xs">{doc.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate("/documents");
            }}
          >
            Take me to my documents
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Keep looking around
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One hook for a screen that has several blocked controls.
 *
 * `guard(fn)` returns a handler that runs `fn` when the paperwork is done and opens the wall
 * when it is not. Unknown does neither: it is not an answer, and acting on it either way is a
 * guess about somebody's legal record.
 */
export function useDocumentGuard() {
  const { blocked, missing } = useDocumentGate();
  const [open, setOpen] = useState(false);
  function guard<T extends unknown[]>(action: (...args: T) => void) {
    return (...args: T) => {
      if (blocked === true) {
        setOpen(true);
        return;
      }
      if (blocked === undefined) return;
      action(...args);
    };
  }
  return {
    blocked,
    guard,
    gateDialog: <DocumentsRequiredDialog open={open} onOpenChange={setOpen} missing={missing} />,
  };
}
