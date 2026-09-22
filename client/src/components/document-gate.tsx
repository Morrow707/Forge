import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  // Whether an outstanding document actually stops anything. False through beta -- see the
  // route's own comment. Optional so an older cached response cannot read as "enforce now".
  enforced?: boolean;
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
  // ENFORCEMENT IS A SEPARATE ANSWER FROM COMPLETENESS, and both have to be true to block.
  //
  // `missing` is still returned in every case, because the banner naming what is outstanding is
  // useful whether or not it stops anything. What changes is whether a control refuses.
  // Blocking on `complete` alone would strand every athlete who has not filed a participation
  // waiver, which today is almost all of them.
  return { blocked: data.enforced === true && !data.complete, missing: data.missing };
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
  // A TAP THAT ARRIVES BEFORE THE ANSWER IS HELD, NOT DROPPED.
  //
  // Swallowing it -- which is what this did -- makes the button dead for as long as the request
  // is in flight, with no spinner and no refusal, so the athlete taps again and nothing happens
  // twice. "Unknown is not yes and not no" is the right rule for what to DRAW; it is the wrong
  // rule for what to do with a press somebody has already made. The press is remembered and
  // runs the instant the answer lands, or meets the wall if the answer is no.
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (blocked === undefined) return;
    const held = pending.current;
    if (!held) return;
    pending.current = null;
    if (blocked) setOpen(true);
    else held();
  }, [blocked]);
  function guard<T extends unknown[]>(action: (...args: T) => void) {
    return (...args: T) => {
      if (blocked === true) {
        setOpen(true);
        return;
      }
      if (blocked === undefined) {
        pending.current = () => action(...args);
        return;
      }
      action(...args);
    };
  }
  return {
    blocked,
    guard,
    gateDialog: <DocumentsRequiredDialog open={open} onOpenChange={setOpen} missing={missing} />,
  };
}


/** THE WALL AS A PAGE, for a whole screen rather than one control.
 *
 * Same shape as SkillsGate and FreeAgentGate, deliberately: training and skills are screens an
 * athlete reaches by several routes, and guarding every button that leads to one is a list
 * somebody will fall off. The per-control useDocumentGuard above stays for the places where a
 * page is legitimately open and one action inside it is not.
 *
 * `blocked === undefined` renders the children rather than a spinner. That is the opposite of
 * SkillsGate and it is deliberate: a skills page behind an unpaid tier should not flash into
 * view, but a training page is one this athlete is overwhelmingly likely to be allowed on --
 * enforcement is off entirely through beta -- so holding their workout behind a spinner on every
 * navigation costs every athlete a wait to catch a case that currently never fires.
 */
export function DocumentsGate({ children }: { children: ReactNode }) {
  const { blocked, missing } = useDocumentGate();
  const [, navigate] = useLocation();
  if (blocked !== true) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <FileWarning className="mx-auto h-10 w-10 text-primary" />
      <h2 className="mt-4 text-xl font-semibold">Finish your documents first</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Training, skills and the camera unlock as soon as these are on file.
      </p>
      <ul className="mt-5 space-y-2 text-left">
        {missing.map((doc) => (
          <li key={doc.kind} className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold">{doc.label}</p>
            <p className="text-xs text-muted-foreground">{doc.why}</p>
          </li>
        ))}
      </ul>
      <Button type="button" className="mt-6 w-full" onClick={() => navigate("/documents")}>
        Take me to my documents
      </Button>
    </div>
  );
}
