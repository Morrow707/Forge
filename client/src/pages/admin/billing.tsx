import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Ticket, DollarSign, RotateCcw, GraduationCap } from "lucide-react";

type RedeemCode = {
  id: number;
  code: string;
  trialDays: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  createdAt: string;
};

type PricingItem = {
  key: string;
  category: string;
  label: string;
  description: string;
  defaultCents: number;
  currentCents: number;
  overridden: boolean;
};

type ClassLessonPrice = {
  classId: number;
  className: string;
  lessonId: number;
  lessonNumber: number;
  lessonTitle: string;
  priceCents: number | null;
};

function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Math.round(Number(trimmed) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** One editable price row shared by the pricing catalog and the Forge Class
 * lesson list below -- local draft state seeded from the server value,
 * Save only enabled once it actually differs, Reset clears back to the
 * coded default (catalog rows only; a class lesson has no "default" to
 * revert to). */
function PriceRow({
  label,
  description,
  currentCents,
  overridden,
  onSave,
  onReset,
  saving,
  allowBlank,
}: {
  label: string;
  description?: string;
  currentCents: number | null;
  overridden?: boolean;
  onSave: (cents: number | null) => void;
  onReset?: () => void;
  saving: boolean;
  /** Class lessons: blank means free, so an empty draft is a valid, savable
   * value. Catalog rows never allow a blank save -- clearing back to the
   * coded default goes through the explicit Reset button instead. */
  allowBlank?: boolean;
}) {
  const [draft, setDraft] = useState(centsToInput(currentCents));
  const draftCents = dollarsToCents(draft);
  const draftIsBlank = draft.trim() === "";
  const dirty = draftIsBlank
    ? allowBlank && currentCents != null
    : draftCents != null && draftCents !== currentCents;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {label} {overridden && <Badge variant="outline" className="ml-1 text-[9px]">edited</Badge>}
        </p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-sm text-muted-foreground">$</span>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={allowBlank ? "free" : undefined}
          className="w-24"
        />
        <Button size="sm" variant="secondary" disabled={!dirty || saving} onClick={() => onSave(draftIsBlank ? null : draftCents)}>
          Save
        </Button>
        {onReset && overridden && (
          <Button size="icon" variant="ghost" onClick={onReset} disabled={saving} aria-label="Reset to default">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Billing-only admin page: create/manage redeem codes, and edit every
 * priced thing on the platform in one place. Per-account tier assignment
 * (org billing tier, Free Agent tier, family groups) used to live here too
 * -- pulled out since nothing on this page needs a coach/athlete lookup to
 * just see and edit prices, and the lookup tools weren't finding accounts
 * as expected. The server routes those used (/api/admin/coaches/:id/billing
 * etc.) are untouched, just no longer surfaced from this page. */
export default function AdminBilling() {
  const qc = useQueryClient();

  const [newCode, setNewCode] = useState("");
  const [newTrialDays, setNewTrialDays] = useState("14");
  const [newMaxRedemptions, setNewMaxRedemptions] = useState("");

  const { data: codes = [] } = useQuery<RedeemCode[]>({
    queryKey: ["/api/admin/redeem-codes"],
    queryFn: () => getJson("/api/admin/redeem-codes"),
  });

  const { data: pricing = [], isLoading: pricingLoading } = useQuery<PricingItem[]>({
    queryKey: ["/api/admin/pricing"],
    queryFn: () => getJson("/api/admin/pricing"),
  });

  const { data: classLessons = [] } = useQuery<ClassLessonPrice[]>({
    queryKey: ["/api/admin/pricing/class-lessons"],
    queryFn: () => getJson("/api/admin/pricing/class-lessons"),
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

  const savePriceMutation = useMutation({
    mutationFn: async ({ key, priceCents }: { key: string; priceCents: number | null }) => {
      await apiRequest("PATCH", `/api/admin/pricing/${key}`, { priceCents });
    },
    onSuccess: () => {
      toast.success("Price updated");
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save price"),
  });

  const saveLessonPriceMutation = useMutation({
    mutationFn: async ({ lessonId, priceCents }: { lessonId: number; priceCents: number | null }) => {
      await apiRequest("PATCH", `/api/admin/pricing/class-lessons/${lessonId}`, { priceCents });
    },
    onSuccess: () => {
      toast.success("Price updated");
      qc.invalidateQueries({ queryKey: ["/api/admin/pricing/class-lessons"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save price"),
  });

  const categories = Array.from(new Set(pricing.map((p) => p.category)));
  const lessonsByClass = new Map<string, ClassLessonPrice[]>();
  for (const l of classLessons) {
    if (!lessonsByClass.has(l.className)) lessonsByClass.set(l.className, []);
    lessonsByClass.get(l.className)!.push(l);
  }

  return (
    <AppShell title="Billing">
      <div className="mx-auto max-w-3xl space-y-4">
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
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4" />
              Pricing
            </CardTitle>
            <CardDescription>
              Every priced thing on the platform -- the org/coach plan formula, personalization
              add-ons, Free Agent tiers and sport add-ons, video storage, and Skill Bank unlocks.
              Edit any price here; nothing is charged automatically yet (no live checkout), this
              is the source every price shown elsewhere reads from.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {pricingLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {categories.map((cat) => (
              <div key={cat}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat}
                </p>
                <div>
                  {pricing
                    .filter((p) => p.category === cat)
                    .map((p) => (
                      <PriceRow
                        key={p.key}
                        label={p.label}
                        description={p.description}
                        currentCents={p.currentCents}
                        overridden={p.overridden}
                        saving={savePriceMutation.isPending}
                        onSave={(cents) => savePriceMutation.mutate({ key: p.key, priceCents: cents })}
                        onReset={() => savePriceMutation.mutate({ key: p.key, priceCents: null })}
                      />
                    ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {lessonsByClass.size > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-4 w-4" />
                Forge Class lesson prices
              </CardTitle>
              <CardDescription>
                Per-lesson pricing only ever applies to a Forge-official class sold to a Free
                Agent -- a coach's own class is never priced to their own roster. Blank = free.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {[...lessonsByClass.entries()].map(([className, lessons]) => (
                <div key={className}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {className}
                  </p>
                  <div>
                    {lessons.map((l) => (
                      <PriceRow
                        key={l.lessonId}
                        label={`Lesson ${l.lessonNumber}: ${l.lessonTitle}`}
                        currentCents={l.priceCents}
                        allowBlank
                        saving={saveLessonPriceMutation.isPending}
                        onSave={(cents) =>
                          saveLessonPriceMutation.mutate({ lessonId: l.lessonId, priceCents: cents })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
