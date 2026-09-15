import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ForgeMark } from "@/components/forge-mark";
import { useAuth } from "@/hooks/use-auth";
import { todayIso } from "@/lib/local-date";
import type { PublicUser } from "@shared/schema";

/** The other half of the minor gate (see the guardian gate in server/routes.ts).
 *
 * An athlete with no date of birth on file has no derivable privacy tier, so nobody can say
 * whether they need a guardian -- and the rule is that every minor has one however they arrived.
 * The gate therefore holds them, and this is the screen that hold reads as.
 *
 * Deliberately NOT the guardian-pending screen. That one tells the athlete to go and ask a parent,
 * which is an instruction this athlete cannot act on: what is missing is one field they fill in
 * themselves. An adult who fills it in is past the gate on the next request; a minor who fills it
 * in moves to the guardian-pending screen instead, which is the honest next step for them.
 */
export default function DateOfBirthRequiredPage() {
  const qc = useQueryClient();
  const { logoutMutation } = useAuth();
  const [dateOfBirth, setDateOfBirth] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/account/backfill-date-of-birth", { dateOfBirth });
      return (await res.json()) as PublicUser;
    },
    // Writing the fresh user straight into the cache is what re-evaluates the gate: the same
    // response carries whichever hold comes next, so an adult lands in the app and a minor lands
    // on the guardian screen without a second round trip.
    onSuccess: (user) => {
      qc.setQueryData(["/api/auth/me"], user);
      toast.success("Date of birth saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that"),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <ForgeMark className="mx-auto h-14 w-14 rounded-xl" />
        <div className="space-y-3">
          <CalendarClock className="mx-auto h-8 w-8 text-primary" />
          <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide">
            One more step
          </h1>
          <p className="text-sm text-muted-foreground">
            We need your date of birth before you can use Forge. It decides which privacy
            protections apply to your account, and if you're under 18 it's what tells us to ask a
            parent or guardian to set up their own linked account.
          </p>
        </div>
        <form
          className="space-y-3 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (dateOfBirth) submit.mutate();
          }}
        >
          <Label htmlFor="dob-required">Date of birth</Label>
          <Input
            id="dob-required"
            type="date"
            value={dateOfBirth}
            max={todayIso()}
            onChange={(e) => setDateOfBirth(e.target.value)}
            required
          />
          <Button type="submit" className="w-full" disabled={!dateOfBirth || submit.isPending}>
            {submit.isPending ? "Saving..." : "Save and continue"}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
