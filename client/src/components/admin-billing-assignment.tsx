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
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
} from "@shared/free-agent-tiers";
import { VIDEO_STORAGE_ADD_ON } from "@shared/video-retention";

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
      await apiRequest("PATCH", `/api/admin/coaches/${userId}/billing`, {
        billingTier: tier === NONE ? null : tier,
        billingAddOns: addOns,
        isBetaAccount: beta,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lookupKey });
      qc.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      toast.success("Billing updated");
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

function AthleteBillingForm({ userId, email }: { userId: number; email: string }) {
  const qc = useQueryClient();
  const lookupKey = [`/api/admin/athletes/lookup`, email];
  const { data, isLoading } = useQuery<AthleteBilling>({
    queryKey: lookupKey,
    queryFn: () => getJson(`/api/admin/athletes/lookup?email=${encodeURIComponent(email)}`),
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
      await apiRequest("PATCH", `/api/admin/athletes/${userId}/billing`, {
        freeAgentTier: tier === NONE ? null : tier,
        freeAgentAddOns: addOns,
        isBetaAccount: beta,
        hasVideoStorageAddOn: videoStorage,
        unlockedSkillSports: sports,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lookupKey });
      qc.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      toast.success("Billing updated");
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
            {FREE_AGENT_TIER_ORDER.map((id) => (
              <SelectItem key={id} value={id}>
                {FREE_AGENT_TIERS[id].label} —{" "}
                {formatCents(FREE_AGENT_TIERS[id].monthlyPriceCents)}/mo
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Sport coaches</Label>
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
