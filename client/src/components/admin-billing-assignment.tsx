import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import {
  BILLING_TIERS,
  BILLING_TIER_ORDER,
  BILLING_ADD_ONS,
  BILLING_ADD_ON_ORDER,
  formatCents,
} from "@shared/billing-tiers";
import {
  FREE_AGENT_TIERS,
  ALL_FREE_AGENT_TIER_IDS,
  WITHDRAWN_FREE_AGENT_TIERS,
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
} from "@shared/free-agent-tiers";
import { VIDEO_STORAGE_ADD_ON } from "@shared/video-retention";
import type { AddOnStillBilling } from "@shared/add-on-terms";

/**
 * Per-account billing assignment, on the admin user detail panel.
 *
 * This existed once on /admin/billing and was pulled out, leaving five complete,
 * guarded server routes with no caller anywhere in the repo -- the admin billing
 * page's own docblock said so. That mattered more than it looks: nothing else writes
 * users.billingTier, and getInstitutionalAgreementStatus returns {required: false}
 * for any coach without one, so with no way to assign a tier the Institutional
 * Service Agreement banner could never appear for anybody either. Two features, one
 * missing door.
 *
 * It lives here rather than back on /admin/billing because this panel already
 * resolves a specific person and shows these exact fields read-only, so the email
 * lookup the old tool needed is redundant. The lookup routes are still what supply
 * the add-on arrays, which the user-detail payload does not carry.
 */
type CoachBilling = {
  id: number;
  isPrimary: boolean;
  rosterCount: number;
  billingTier: string | null;
  billingAddOns: string[];
  isBetaAccount: boolean;
  institutionalAgreement: { required: boolean; acceptedAt?: string | null };
};

type AthleteBilling = {
  id: number;
  freeAgentTier: string | null;
  freeAgentAddOns: string[];
  isBetaAccount: boolean;
  hasVideoStorageAddOn: boolean;
  unlockedSkillSports: string[];
};

const NONE = "__none__";

/**
 * SAY WHAT UN-TICKING AN ADD-ON DID NOT DO.
 *
 * Un-ticking the box closes access the moment it saves, and that is all it does: the add-on's
 * own Stripe subscription (or the Apple one, which this server cannot touch at all) carries on
 * charging the card until somebody stops it at the provider. Until 2026-10-14 the screen said
 * "Billing updated" and nothing else, so an admin removing a bought add-on had no way to know
 * the money was still moving -- the same lie the self-serve cancel route refuses to tell with
 * its `alsoCancelInAppStore`. Forge does not cancel a customer's subscription as a side effect
 * of a checkbox, so the honest version is this: name the subscription, and leave it to the
 * person who meant it.
 *
 * Long duration on purpose. This is the one message on the panel that is an instruction to go
 * and do something somewhere else, and a four-second toast is how it gets missed.
 */
function reportStillBilling(stillBilling: AddOnStillBilling[] | undefined) {
  for (const entry of stillBilling ?? []) {
    // Both maps, because one column (users.addOnTerms) carries the coach ids and the Free Agent
    // ids and they are disjoint by test -- so whichever side this panel is on, the label is in
    // one of the two. The raw id is the fallback rather than a blank: an admin chasing a
    // subscription needs to know which product it is even if the maps are reorganised.
    const label =
      (FREE_AGENT_ADD_ONS as Record<string, { label: string }>)[entry.addOnId]?.label ??
      (BILLING_ADD_ONS as Record<string, { label: string }>)[entry.addOnId]?.label ??
      entry.addOnId;
    const handle = entry.stripeSubscriptionId
      ? `Stripe subscription ${entry.stripeSubscriptionId}`
      : `Apple subscription ${entry.appleOriginalTransactionId}`;
    toast.warning(
      `Access to ${label} is closed, but ${handle} is still billing. Cancel it at the ` +
        `provider — saving here does not.`,
      { duration: 30000 },
    );
  }
}

type PlanStillBilling = { what: string; handle: string; provider: "stripe" | "apple" } | null;

type AdminBillingSaveResult = {
  addOnsGranted?: string[];
  addOnsStillBilling?: AddOnStillBilling[];
  planStillBilling?: PlanStillBilling;
};

/** CLEARING A PLAN CLOSES ACCESS AND DOES NOT STOP THE MONEY.
 *
 *  The add-on half of this panel has warned since 2026-10-14; the tier and the band never did,
 *  which is the asymmetry the 2026-10-15 audit named. Same rule as un-ticking an add-on: the
 *  server does not cancel somebody's subscription as a side effect of a dropdown, so the admin is
 *  told plainly and given the handle to chase. An App Store subscription cannot be cancelled from
 *  here at all -- only the person can, in iOS Settings -- so the sentence says which rail it is. */
function reportPlanStillBilling(plan: PlanStillBilling | undefined) {
  if (!plan) return;
  toast.warning(
    plan.provider === "apple"
      ? `Plan cleared, but the App Store is still billing this account (${plan.handle}). ` +
          `Only the account holder can stop it, in iOS Settings.`
      : `Plan cleared, but Stripe is still billing this account (${plan.handle}). ` +
          `Nothing was cancelled -- end it in the Stripe dashboard.`,
    { duration: 30000 },
  );
}

export function AdminBillingAssignment({
  userId,
  email,
  role,
}: {
  userId: number;
  email: string;
  role: "coach" | "athlete";
}) {
  return role === "coach" ? (
    <CoachBillingForm userId={userId} email={email} />
  ) : (
    <AthleteBillingForm userId={userId} email={email} />
  );
}

function CoachBillingForm({ userId, email }: { userId: number; email: string }) {
  const qc = useQueryClient();
  const lookupKey = [`/api/admin/coaches/lookup`, email];
  const { data, isLoading } = useQuery<CoachBilling>({
    queryKey: lookupKey,
    queryFn: () => getJson(`/api/admin/coaches/lookup?email=${encodeURIComponent(email)}`),
  });

  const [tier, setTier] = useState<string>(NONE);
  const [addOns, setAddOns] = useState<string[]>([]);
  const [beta, setBeta] = useState(false);
  useEffect(() => {
    if (!data) return;
    setTier(data.billingTier ?? NONE);
    setAddOns(data.billingAddOns);
    setBeta(data.isBetaAccount);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/coaches/${userId}/billing`, {
        billingTier: tier === NONE ? null : tier,
        billingAddOns: addOns,
        isBetaAccount: beta,
      });
      return (await res.json()) as AdminBillingSaveResult;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: lookupKey });
      qc.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      toast.success("Billing updated");
      reportStillBilling(result.addOnsStillBilling);
      reportPlanStillBilling(result.planStillBilling);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update billing"),
  });

  if (isLoading) return <div className="h-20 animate-pulse rounded-md bg-surface" />;
  if (!data) return null;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Billing assignment
        </p>
        <p className="text-xs text-muted-foreground">
          {data.rosterCount} on roster
          {data.institutionalAgreement.required && !data.institutionalAgreement.acceptedAt
            ? " · service agreement outstanding"
            : data.institutionalAgreement.acceptedAt
              ? " · service agreement accepted"
              : ""}
        </p>
      </div>

      {/* The route refuses a staff member outright -- billing belongs to the org, not
          to one person on it -- so say so here instead of letting them fill the form
          in and collect a 400. */}
      {!data.isPrimary ? (
        <p className="text-xs text-amber-500">
          Staff member. Billing is assigned to the primary coach of the org.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Org plan band</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No plan (beta / unbilled)</SelectItem>
                {BILLING_TIER_ORDER.map((id) => (
                  <SelectItem key={id} value={id}>
                    {BILLING_TIERS[id].label} — {formatCents(BILLING_TIERS[id].monthlyPriceCents)}/mo
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Add-ons</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {BILLING_ADD_ON_ORDER.map((id) => (
                <label key={id} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={addOns.includes(id)}
                    onCheckedChange={(c) =>
                      setAddOns((prev) => (c === true ? [...prev, id] : prev.filter((x) => x !== id)))
                    }
                  />
                  {BILLING_ADD_ONS[id].label}
                </label>
              ))}
            </div>
          </div>

          <BetaToggle beta={beta} setBeta={setBeta} />

          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save billing"}
          </Button>
        </>
      )}
    </div>
  );
}

// Read by ID, never by email: the Users page withholds every athlete's email from admins on
// purpose, so the email lookup this form used until 2026-10-11 was handed "" for every athlete,
// got a 400, and the whole panel rendered nothing -- no Free Agent tier could be assigned to
// anybody. The `email` prop is kept so the call site's shape is unchanged; it is not read.
function AthleteBillingForm({ userId }: { userId: number; email: string }) {
  const qc = useQueryClient();
  const lookupKey = [`/api/admin/athletes`, userId, "billing"];
  const { data, isLoading } = useQuery<AthleteBilling>({
    queryKey: lookupKey,
    queryFn: () => getJson(`/api/admin/athletes/${userId}/billing`),
  });
  // Only sports with real drill content behind them -- unlocking (and one day
  // selling) a sport with nothing in it is the mistake this route exists to stop.
  const { data: sportsData } = useQuery<{ sports: string[] }>({
    queryKey: ["/api/admin/skill-sports-with-content"],
    queryFn: () => getJson("/api/admin/skill-sports-with-content"),
  });

  const [tier, setTier] = useState<string>(NONE);
  const [addOns, setAddOns] = useState<string[]>([]);
  const [beta, setBeta] = useState(false);
  const [videoStorage, setVideoStorage] = useState(false);
  const [sports, setSports] = useState<string[]>([]);
  useEffect(() => {
    if (!data) return;
    setTier(data.freeAgentTier ?? NONE);
    setAddOns(data.freeAgentAddOns);
    setBeta(data.isBetaAccount);
    setVideoStorage(data.hasVideoStorageAddOn);
    setSports(data.unlockedSkillSports);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/athletes/${userId}/billing`, {
        freeAgentTier: tier === NONE ? null : tier,
        freeAgentAddOns: addOns,
        isBetaAccount: beta,
        hasVideoStorageAddOn: videoStorage,
        unlockedSkillSports: sports,
      });
      return (await res.json()) as AdminBillingSaveResult;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: lookupKey });
      qc.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      toast.success("Billing updated");
      reportStillBilling(result.addOnsStillBilling);
      reportPlanStillBilling(result.planStillBilling);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update billing"),
  });

  if (isLoading) return <div className="h-20 animate-pulse rounded-md bg-surface" />;
  if (!data) return null;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Billing assignment
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Free Agent tier</Label>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None (coached, or unbilled)</SelectItem>
            {/* ALL_FREE_AGENT_TIER_IDS, not the for-sale list. This is the one screen where a
                withdrawn tier still has to appear: athletes are already on AI Coach + Video, an
                admin has to be able to see that and to move somebody off it, and a dropdown that
                silently omitted their current tier would show the wrong value and write it on the
                next save. Marked so nobody assigns it by accident. */}
            {ALL_FREE_AGENT_TIER_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {FREE_AGENT_TIERS[id].label} —{" "}
                {formatCents(FREE_AGENT_TIERS[id].monthlyPriceCents)}/mo
                {WITHDRAWN_FREE_AGENT_TIERS.includes(id) ? " (withdrawn — not for sale)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Add-ons</Label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {FREE_AGENT_ADD_ON_ORDER.map((id) => (
            <label key={id} className="flex items-center gap-1.5 text-xs">
              <Checkbox
                checked={addOns.includes(id)}
                onCheckedChange={(c) =>
                  setAddOns((prev) => (c === true ? [...prev, id] : prev.filter((x) => x !== id)))
                }
              />
              {FREE_AGENT_ADD_ONS[id].label}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <Checkbox
          checked={videoStorage}
          onCheckedChange={(c) => setVideoStorage(c === true)}
        />
        Extra video storage ({VIDEO_STORAGE_ADD_ON.totalCap} clips,{" "}
        {formatCents(VIDEO_STORAGE_ADD_ON.monthlyPriceCents)}/mo)
      </label>

      {(sportsData?.sports.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Skill Bank sports</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {sportsData!.sports.map((sport) => (
              <label key={sport} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={sports.includes(sport)}
                  onCheckedChange={(c) =>
                    setSports((prev) =>
                      c === true ? [...prev, sport] : prev.filter((x) => x !== sport),
                    )
                  }
                />
                {sport}
              </label>
            ))}
          </div>
        </div>
      )}

      <BetaToggle beta={beta} setBeta={setBeta} />

      <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving…" : "Save billing"}
      </Button>
    </div>
  );
}

/** isBetaAccount is the switch that exempts an account from every paywall, so it is
 * worth labelling as what it does rather than as a flag name. */
function BetaToggle({ beta, setBeta }: { beta: boolean; setBeta: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-1.5 text-xs">
      <Checkbox checked={beta} onCheckedChange={(c) => setBeta(c === true)} />
      <span>
        Beta account
        <span className="block text-muted-foreground">
          Exempt from every paywall, whatever the tier above says.
        </span>
      </span>
    </label>
  );
}
