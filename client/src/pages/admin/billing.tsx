import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  BILLING_TIERS,
  BILLING_TIER_ORDER,
  BILLING_ADD_ONS,
  BILLING_ADD_ON_ORDER,
  formatCents,
  type BillingTierId,
  type AddOnId,
} from "@shared/billing-tiers";

type CoachLookup = {
  id: number;
  name: string;
  email: string;
  isPrimary: boolean;
  rosterCount: number;
  billingTier: string | null;
  billingAddOns: string[];
  isBetaAccount: boolean;
};

/** No self-serve checkout exists yet -- this is the only place a real
 * coach account gets a billingTier/billingAddOns/isBetaAccount set (see
 * shared/billing-tiers.ts, server/billing.ts). Look up an org by its
 * primary coach's email, then assign. */
export default function AdminBilling() {
  const qc = useQueryClient();
  const [emailInput, setEmailInput] = useState("");
  const [coach, setCoach] = useState<CoachLookup | null>(null);
  const [tier, setTier] = useState<string>("none");
  const [addOns, setAddOns] = useState<Set<AddOnId>>(new Set());
  const [isBeta, setIsBeta] = useState(true);

  const lookupMutation = useMutation({
    mutationFn: async (email: string) => getJson(`/api/admin/coaches/lookup?email=${encodeURIComponent(email)}`) as Promise<CoachLookup>,
    onSuccess: (data) => {
      setCoach(data);
      setTier(data.billingTier ?? "none");
      setAddOns(new Set(data.billingAddOns as AddOnId[]));
      setIsBeta(data.isBetaAccount);
    },
    onError: (err: ApiError) => {
      setCoach(null);
      toast.error(err.message || "No coach found with that email");
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!coach) return;
      await apiRequest("PATCH", `/api/admin/coaches/${coach.id}/billing`, {
        billingTier: tier === "none" ? null : tier,
        billingAddOns: Array.from(addOns),
        isBetaAccount: isBeta,
      });
    },
    onSuccess: () => {
      toast.success("Billing updated");
      qc.invalidateQueries({ queryKey: ["/api/admin/coaches/lookup"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save"),
  });

  function toggleAddOn(id: AddOnId) {
    const next = new Set(addOns);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setAddOns(next);
  }

  return (
    <AppShell title="Billing">
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find a coach</CardTitle>
            <CardDescription>
              Look up an org by its primary coach's email to assign a tier or add-ons.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="coach@example.com"
              onKeyDown={(e) => e.key === "Enter" && emailInput.trim() && lookupMutation.mutate(emailInput.trim())}
            />
            <Button
              type="button"
              onClick={() => lookupMutation.mutate(emailInput.trim())}
              disabled={!emailInput.trim() || lookupMutation.isPending}
            >
              <Search className="h-4 w-4" />
              Look up
            </Button>
          </CardContent>
        </Card>

        {coach && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{coach.name}</CardTitle>
              <CardDescription>
                {coach.email} · {coach.rosterCount} athlete{coach.rosterCount === 1 ? "" : "s"} on
                roster
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!coach.isPrimary ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  This account is staff under another coach's org -- billing is assigned to the
                  primary coach, not a staff member. Look up the primary instead.
                </p>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Tier</Label>
                    <Select value={tier} onValueChange={setTier}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No tier assigned</SelectItem>
                        {BILLING_TIER_ORDER.map((id) => (
                          <SelectItem key={id} value={id}>
                            {BILLING_TIERS[id].label} -- {formatCents(BILLING_TIERS[id].monthlyPriceCents)}/mo,{" "}
                            {BILLING_TIERS[id].athleteCapIncluded ?? "unlimited"} athletes
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Add-ons</Label>
                    <div className="space-y-2">
                      {BILLING_ADD_ON_ORDER.map((id) => (
                        <label key={id} className="flex items-center gap-2 text-sm hover:cursor-pointer">
                          <Checkbox checked={addOns.has(id)} onCheckedChange={() => toggleAddOn(id)} />
                          {BILLING_ADD_ONS[id].label} -- {formatCents(BILLING_ADD_ONS[id].monthlyPriceCents)}/mo
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 rounded-md border border-border p-3 text-sm hover:cursor-pointer">
                    <Checkbox checked={isBeta} onCheckedChange={(v) => setIsBeta(v === true)} />
                    <span>
                      <span className="font-medium">Beta account</span> -- fully unlocked
                      regardless of tier/add-ons, exempt from billing enforcement entirely.
                    </span>
                  </label>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    Save
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
