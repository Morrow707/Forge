import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Search, Ticket, Users, Video } from "lucide-react";
import {
  BILLING_TIERS,
  BILLING_TIER_ORDER,
  BILLING_ADD_ONS,
  BILLING_ADD_ON_ORDER,
  formatCents,
  type BillingTierId,
  type AddOnId,
} from "@shared/billing-tiers";
import {
  FREE_AGENT_TIERS,
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_ADD_ONS,
  FREE_AGENT_ADD_ON_ORDER,
  type FreeAgentTierId,
  type FreeAgentAddOnId,
} from "@shared/free-agent-tiers";
import { VIDEO_STORAGE_ADD_ON, VIDEO_RETENTION } from "@shared/video-retention";
import { SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS } from "@shared/free-agent-tiers";
import { SPORTS } from "@shared/exercise-taxonomy";
import { FilterChipGroup, toggleInSet } from "@/components/filter-chip-group";

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

type RedeemCode = {
  id: number;
  code: string;
  trialDays: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  createdAt: string;
};

type AthleteLookup = {
  id: number;
  name: string;
  email: string;
  freeAgentTier: string | null;
  freeAgentAddOns: string[];
  isBetaAccount: boolean;
  familyGroupId: number | null;
  hasVideoStorageAddOn: boolean;
  unlockedSkillSports: string[];
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

  const [newCode, setNewCode] = useState("");
  const [newTrialDays, setNewTrialDays] = useState("14");
  const [newMaxRedemptions, setNewMaxRedemptions] = useState("");

  const [athleteEmailInput, setAthleteEmailInput] = useState("");
  const [athlete, setAthlete] = useState<AthleteLookup | null>(null);
  const [freeAgentTier, setFreeAgentTier] = useState<string>("none");
  const [freeAgentAddOns, setFreeAgentAddOns] = useState<Set<FreeAgentAddOnId>>(new Set());
  const [athleteIsBeta, setAthleteIsBeta] = useState(true);
  const [videoStorageAddOn, setVideoStorageAddOn] = useState(false);
  const [unlockedSkillSports, setUnlockedSkillSports] = useState<Set<string>>(new Set());

  const [familyEmails, setFamilyEmails] = useState(["", "", ""]);

  const { data: codes = [] } = useQuery<RedeemCode[]>({
    queryKey: ["/api/admin/redeem-codes"],
    queryFn: () => getJson("/api/admin/redeem-codes"),
  });

  const createCodeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/redeem-codes", {
        code: newCode.trim(),
        trialDays: Number(newTrialDays),
        maxRedemptions: newMaxRedemptions.trim() ? Number(newMaxRedemptions) : null,
      });
    },
    onSuccess: () => {
      toast.success("Code created");
      setNewCode("");
      setNewTrialDays("14");
      setNewMaxRedemptions("");
      qc.invalidateQueries({ queryKey: ["/api/admin/redeem-codes"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't create code"),
  });

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

  const lookupAthleteMutation = useMutation({
    mutationFn: async (email: string) =>
      getJson(`/api/admin/athletes/lookup?email=${encodeURIComponent(email)}`) as Promise<AthleteLookup>,
    onSuccess: (data) => {
      setAthlete(data);
      setFreeAgentTier(data.freeAgentTier ?? "none");
      setFreeAgentAddOns(new Set(data.freeAgentAddOns as FreeAgentAddOnId[]));
      setAthleteIsBeta(data.isBetaAccount);
      setVideoStorageAddOn(data.hasVideoStorageAddOn);
      setUnlockedSkillSports(new Set(data.unlockedSkillSports));
    },
    onError: (err: ApiError) => {
      setAthlete(null);
      toast.error(err.message || "No athlete found with that email");
    },
  });

  const saveAthleteMutation = useMutation({
    mutationFn: async () => {
      if (!athlete) return;
      await apiRequest("PATCH", `/api/admin/athletes/${athlete.id}/billing`, {
        freeAgentTier: freeAgentTier === "none" ? null : freeAgentTier,
        freeAgentAddOns: Array.from(freeAgentAddOns),
        isBetaAccount: athleteIsBeta,
        hasVideoStorageAddOn: videoStorageAddOn,
        unlockedSkillSports: Array.from(unlockedSkillSports),
      });
    },
    onSuccess: () => {
      toast.success("Billing updated");
      qc.invalidateQueries({ queryKey: ["/api/admin/athletes/lookup"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save"),
  });

  function toggleFreeAgentAddOn(id: FreeAgentAddOnId) {
    const next = new Set(freeAgentAddOns);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFreeAgentAddOns(next);
  }

  const createFamilyGroupMutation = useMutation({
    mutationFn: async () => {
      const emails = familyEmails.map((e) => e.trim()).filter(Boolean);
      await apiRequest("POST", "/api/admin/family-groups", { athleteEmails: emails });
    },
    onSuccess: () => {
      toast.success("Family group created");
      setFamilyEmails(["", "", ""]);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't create family group"),
  });

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
                            {BILLING_TIERS[id].label} -- {formatCents(BILLING_TIERS[id].monthlyPriceCents)}/mo
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ticket className="h-4 w-4" />
              Redeem codes
            </CardTitle>
            <CardDescription>
              Trial promos a coach can redeem for temporary full access (e.g. a 14-day new-coach
              offer, a seasonal free month) -- doesn't require a tier to be assigned first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="WELCOME14"
                className="col-span-3 font-mono uppercase sm:col-span-1"
              />
              <Input
                type="number"
                min={1}
                value={newTrialDays}
                onChange={(e) => setNewTrialDays(e.target.value)}
                placeholder="Trial days"
              />
              <Input
                type="number"
                min={1}
                value={newMaxRedemptions}
                onChange={(e) => setNewMaxRedemptions(e.target.value)}
                placeholder="Max uses (blank = unlimited)"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => createCodeMutation.mutate()}
              disabled={!newCode.trim() || !newTrialDays.trim() || createCodeMutation.isPending}
            >
              Create code
            </Button>

            {codes.length > 0 && (
              <div className="space-y-1.5 border-t border-border pt-3">
                {codes.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md bg-surface-elevated px-3 py-2 text-sm"
                  >
                    <span className="font-mono font-semibold">{c.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.trialDays}d trial{c.maxRedemptions ? ` · max ${c.maxRedemptions} uses` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find an athlete</CardTitle>
            <CardDescription>
              Look up any athlete by email -- Free Agent AI-coach tier assignment (a separate
              track from coach/org billing above) and the video storage add-on below both work
              here, and the latter applies to a coached athlete too.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              type="email"
              value={athleteEmailInput}
              onChange={(e) => setAthleteEmailInput(e.target.value)}
              placeholder="athlete@example.com"
              onKeyDown={(e) =>
                e.key === "Enter" && athleteEmailInput.trim() && lookupAthleteMutation.mutate(athleteEmailInput.trim())
              }
            />
            <Button
              type="button"
              onClick={() => lookupAthleteMutation.mutate(athleteEmailInput.trim())}
              disabled={!athleteEmailInput.trim() || lookupAthleteMutation.isPending}
            >
              <Search className="h-4 w-4" />
              Look up
            </Button>
          </CardContent>
        </Card>

        {athlete && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{athlete.name}</CardTitle>
              <CardDescription>
                {athlete.email}
                {athlete.familyGroupId != null && ` · in family group #${athlete.familyGroupId}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={freeAgentTier} onValueChange={setFreeAgentTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tier assigned</SelectItem>
                    {FREE_AGENT_TIER_ORDER.map((id) => (
                      <SelectItem key={id} value={id}>
                        {FREE_AGENT_TIERS[id].label} -- {formatCents(FREE_AGENT_TIERS[id].monthlyPriceCents)}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Sport add-ons</Label>
                <p className="text-xs text-muted-foreground">
                  Pricing only -- none of these sport-specialist coaches are built yet, so
                  assigning one here doesn't unlock anything today.
                </p>
                <div className="space-y-2">
                  {FREE_AGENT_ADD_ON_ORDER.map((id) => (
                    <label key={id} className="flex items-center gap-2 text-sm hover:cursor-pointer">
                      <Checkbox
                        checked={freeAgentAddOns.has(id)}
                        onCheckedChange={() => toggleFreeAgentAddOn(id)}
                      />
                      {FREE_AGENT_ADD_ONS[id].label} -- {formatCents(FREE_AGENT_ADD_ONS[id].monthlyPriceCents)}/mo
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Unlocked skill sports</Label>
                <p className="text-xs text-muted-foreground">
                  Every Free Agent gets their own signup sport's Skill Bank free -- toggle on any
                  other sport here to unlock it manually (${(SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS / 100).toFixed(2)}/mo each, no live checkout yet).
                </p>
                <FilterChipGroup
                  label="Sports"
                  options={SPORTS}
                  selected={unlockedSkillSports}
                  onToggle={(v) => toggleInSet(setUnlockedSkillSports, v)}
                />
              </div>

              <label className="flex items-center gap-2 rounded-md border border-border p-3 text-sm hover:cursor-pointer">
                <Checkbox
                  checked={videoStorageAddOn}
                  onCheckedChange={(v) => setVideoStorageAddOn(v === true)}
                />
                <span className="flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-medium">
                      Extra video storage -- {formatCents(VIDEO_STORAGE_ADD_ON.monthlyPriceCents)}/mo
                    </span>{" "}
                    -- {VIDEO_STORAGE_ADD_ON.favoritedCap} favorited / {VIDEO_STORAGE_ADD_ON.totalCap}{" "}
                    total per exercise AND per skill drill (baseline is {VIDEO_RETENTION.favoritedCap}/
                    {VIDEO_RETENTION.totalCap}). Works for a coached athlete too, not just Free
                    Agents.
                  </span>
                </span>
              </label>

              <label className="flex items-center gap-2 rounded-md border border-border p-3 text-sm hover:cursor-pointer">
                <Checkbox checked={athleteIsBeta} onCheckedChange={(v) => setAthleteIsBeta(v === true)} />
                <span>
                  <span className="font-medium">Beta account</span> -- fully unlocked regardless of
                  tier, exempt from billing enforcement entirely.
                </span>
              </label>

              <Button
                type="button"
                className="w-full"
                onClick={() => saveAthleteMutation.mutate()}
                disabled={saveAthleteMutation.isPending}
              >
                Save
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Family groups
            </CardTitle>
            <CardDescription>
              Link up to {FREE_AGENT_TIERS.family.athleteProfileCap} athletes under one Family plan
              -- each gets set to the Family tier automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {familyEmails.map((email, i) => (
                <Input
                  key={i}
                  type="email"
                  value={email}
                  onChange={(e) => {
                    const next = [...familyEmails];
                    next[i] = e.target.value;
                    setFamilyEmails(next);
                  }}
                  placeholder={`Athlete ${i + 1} email${i === 0 ? "" : " (optional)"}`}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => createFamilyGroupMutation.mutate()}
              disabled={!familyEmails[0]?.trim() || createFamilyGroupMutation.isPending}
            >
              Create family group
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
