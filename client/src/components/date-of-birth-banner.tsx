import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type { PublicUser } from "@shared/schema";

/** Shown only for an account old enough to predate dateOfBirth as a signup
 * field at all -- see shared/privacy-tiers.ts's "unknown" tier comment.
 * Same "flag, don't block" treatment as the email-verification banner: a
 * persistent, non-blocking reminder, no dismiss-forever, since a missing
 * date of birth is still missing tomorrow if it's missing today. Opens a
 * small one-field dialog rather than acting inline, since (unlike a resend
 * button) this needs real input -- and only ever fills a currently-empty
 * value, never lets someone edit an existing one back out. */
export function DateOfBirthBanner() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/account/backfill-date-of-birth", { dateOfBirth });
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      qc.setQueryData(["/api/auth/me"], user);
      toast.success("Date of birth saved");
      setOpen(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that"),
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-500 md:px-8">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          Your account is missing a date of birth -- we need it to apply the right privacy protections.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-amber-500 hover:text-amber-500"
          onClick={() => setOpen(true)}
        >
          Add date of birth
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add your date of birth</DialogTitle>
            <DialogDescription>
              Your account was created before Forge collected this. It's used to apply the right
              privacy protections for your age -- it won't be shown to anyone else on the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dob-backfill">Date of birth</Label>
            <Input
              id="dob-backfill"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || !dateOfBirth}
            >
              {submitMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
