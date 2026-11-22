import { useState } from "react";
import { useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReadFailed } from "@/components/read-failed";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminBillingAssignment } from "@/components/admin-billing-assignment";
import {
  Users as UsersIcon,
  Search,
  ShieldAlert,
  BadgeCheck,
  MailWarning,
  KeyRound,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useT } from "@/i18n";

/**
 * Athlete and guardian rows arrive without a name or an email -- the server
 * withholds them (see server/admin-identity.ts) rather than this page
 * choosing not to draw them. So both are optional here, and
 * `identityWithheld` is what the server sets to say the absence is the policy
 * working rather than a row that failed to load.
 */
type UserRow = {
  id: number;
  name?: string | null;
  email?: string | null;
  identityWithheld?: boolean;
  role: "coach" | "athlete" | "admin" | "guardian";
  createdAt: string;
  lastActivityAt: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  sport: string | null;
  position?: string | null;
  gender?: string | null;
  age?: number | null;
  privacyTier?: string | null;
};

/** What to show where a name would go, for an account that has no name to show. */
function displayLabel(u: { id: number; role: string; name?: string | null }): string {
  return u.name ?? `${u.role} #${u.id}`;
}

type UserDetail = UserRow & {
  coachCode: string | null;
  staffInviteCode?: string | null;
  freeAgentTier: string | null;
  billingTier: string | null;
  isBetaAccount: boolean;
  trialExpiresAt: string | null;
  provisionedViaCoachConsent: boolean;
  requiresGuardianNotice: boolean;
  trackingOptOut: boolean;
  position: string | null;
};

const ROLE_FILTERS = ["all", "coach", "athlete", "admin", "guardian"] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

const ROLE_BADGE_CLASS: Record<UserRow["role"], string> = {
  coach: "bg-primary/15 text-primary",
  athlete: "bg-success/15 text-success",
  admin: "bg-amber-500/15 text-amber-500",
  guardian: "bg-purple-500/15 text-purple-400",
};

/** Admin-only account directory -- everywhere else in admin tooling
 * (billing.tsx) can only look an account up if you already know its exact
 * email, so this is the only place an admin can browse or find one from a
 * partial name/email. Capped at storage.USER_SEARCH_LIMIT rather than
 * paginated; narrow the search if you hit the cap. */
export default function AdminUsers() {
  const t = useT();
  const qc = useQueryClient();
  // Dashboard stat tiles (Coaches/Athletes) deep-link here with ?role=coach
  // or ?role=athlete so the tile actually lands on the filtered view it
  // named, not just this page in general.
  const initialParams = new URLSearchParams(useSearch());
  const initialRole = initialParams.get("role");
  // ?search= lands here pre-filtered, the same way ?role= does, and it is for
  // a person arriving with a term they already know -- nothing in the app
  // links here with one.
  //
  // It was added on 2026-09-17 for the waiver review queue, so an admin
  // deciding whether a signed document was about the right child could reach
  // that athlete's account. That caller is gone and the comment it left
  // behind was the thing that made the mechanism look settled: an admin may
  // not know an athlete's name (admin-identity.ts), so getUsersForAdmin
  // refuses a name search for one and that link never matched a row in its
  // life. A deep link built from an athlete is a link to "No accounts match
  // that search" -- see the comment in admin/waivers.tsx.
  const initialSearch = initialParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [appliedSearch, setAppliedSearch] = useState(initialSearch);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(
    ROLE_FILTERS.includes(initialRole as RoleFilter) ? (initialRole as RoleFilter) : "all",
  );
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ id: number; name: string; role: string } | null>(
    null,
  );
  const [mfaResetTarget, setMfaResetTarget] = useState<{ id: number; name: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ users: UserRow[]; limit: number }>({
    queryKey: ["/api/admin/users", appliedSearch, roleFilter],
    queryFn: () =>
      getJson(
        `/api/admin/users?search=${encodeURIComponent(appliedSearch)}${roleFilter !== "all" ? `&role=${roleFilter}` : ""}`,
      ),
  });

  const {
    data: detail,
    isError: detailFailed,
    refetch: refetchDetail,
  } = useQuery<UserDetail>({
    queryKey: ["/api/admin/users", expandedId],
    queryFn: () => getJson(`/api/admin/users/${expandedId}`),
    enabled: expandedId !== null,
  });

  const resetMfaMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/users/${id}/reset-mfa`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success(t("MFA reset, they can log in with just their password now"));
      setMfaResetTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't reset MFA")),
  });

  const roleChangeMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success(t("Role updated"));
      setRoleChangeTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't change that account's role")),
  });

  const users = data?.users ?? [];

  return (
    <AppShell title={t("Users")}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(searchInput.trim())}
            placeholder={t("Search by name or email...")}
            className="pl-8"
            aria-label={t("Search users")}
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setAppliedSearch(searchInput.trim())}>
          {t("Search")}
        </Button>
        <div className="flex flex-wrap items-center gap-1.5">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors",
                roleFilter === r
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t(r)}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {isLoading ? (
            <div className="h-40 animate-pulse bg-surface" />
          ) : isError ? (
            // "No accounts match that search" off a failed request is how an admin
            // concludes an account does not exist -- and the next thing they do is
            // create a duplicate of it.
            <ReadFailed what={t("the account list")} onRetry={() => void refetch()} className="flex flex-col items-center gap-2 py-16 text-center" />
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <UsersIcon className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">{t("No accounts match that search.")}</p>
            </div>
          ) : (
            users.map((u) => {
              const isExpanded = expandedId === u.id;
              return (
                <div key={u.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : u.id)}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-elevated"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{displayLabel(u)}</span>
                        <Badge className={cn("border-none text-[10px] capitalize", ROLE_BADGE_CLASS[u.role])}>
                          {t(u.role)}
                        </Badge>
                        {!u.emailVerified && (
                          <MailWarning className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label={t("Email not verified")} />
                        )}
                        {u.mfaEnabled && (
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-label={t("MFA enabled")} />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email ?? t("identity withheld from admins")}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <p>{t("Joined {date}", { date: t.date(u.createdAt) })}</p>
                      <p>
                        {u.lastActivityAt
                          ? t("Active {date}", { date: t.date(u.lastActivityAt) })
                          : t("No activity yet")}
                      </p>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border bg-surface-elevated/50 p-4">
                      {detailFailed && (!detail || detail.id !== u.id) ? (
                        // Otherwise the skeleton below pulses forever on a failed
                        // read, which reads as a slow panel rather than a broken one --
                        // so nobody retries it and nobody reports it.
                        <ReadFailed
                          what={t("this account's details")}
                          onRetry={() => void refetchDetail()}
                          className="flex flex-col items-start gap-2 text-left"
                        />
                      ) : !detail || detail.id !== u.id ? (
                        <div className="h-16 animate-pulse rounded-md bg-surface" />
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                            <DetailField label={t("User ID")} value={String(detail.id)} />
                            <DetailField label={t("Email verified")} value={detail.emailVerified ? "Yes" : "No"} />
                            <DetailField label={t("MFA enabled")} value={detail.mfaEnabled ? "Yes" : "No"} />
                            {detail.role === "coach" && (
                              <>
                                <DetailField label={t("Coach code")} value={detail.coachCode ?? "--"} mono />
                                <DetailField
                                  label={t("Staff invite code")}
                                  value={detail.staffInviteCode ?? "withheld"}
                                  mono
                                />
                                <DetailField label={t("Billing tier")} value={detail.billingTier ?? "none"} />
                              </>
                            )}
                            {detail.role === "athlete" && (
                              <>
                                <DetailField label={t("Sport / Position")} value={[detail.sport, detail.position].filter(Boolean).join(" / ") || "--"} />
                                <DetailField label={t("Free Agent tier")} value={detail.freeAgentTier ?? "coached"} />
                                <DetailField
                                  label={t("Provisioned via coach consent")}
                                  value={detail.provisionedViaCoachConsent ? t("Yes") : t("No")}
                                />
                                <DetailField
                                  label={t("Requires guardian notice")}
                                  value={detail.requiresGuardianNotice ? t("Yes") : t("No")}
                                />
                                <DetailField label={t("Tracking opted out")} value={detail.trackingOptOut ? "Yes" : "No"} />
                              </>
                            )}
                            <DetailField label={t("Beta account")} value={detail.isBetaAccount ? "Yes" : "No"} />
                            {detail.trialExpiresAt && (
                              <DetailField
                                label={t("Trial expires")}
                                value={new Date(detail.trialExpiresAt).toLocaleDateString()}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMfaResetTarget({ id: detail.id, name: displayLabel(detail) })}
                              disabled={!detail.mfaEnabled}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {t("Reset MFA")}
                            </Button>
                            {detail.role !== "guardian" && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">{t("Change role:")}</span>
                                <Select
                                  value=""
                                  onValueChange={(role) =>
                                    setRoleChangeTarget({ id: detail.id, name: displayLabel(detail), role })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-32 text-xs">
                                    <SelectValue placeholder={detail.role} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(["coach", "athlete", "admin"] as const)
                                      .filter((r) => r !== detail.role)
                                      .map((r) => (
                                        <SelectItem key={r} value={r} className="capitalize">
                                          {t(r)}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>

                          {/* THE ROLE GUARD MOVED INTO THE COMPONENT, and that is the fix
                              rather than a tidy-up. This read `role === "coach" || role ===
                              "athlete"`, matching a prop typed the same way -- two role
                              strings where the pgEnum has four, the documentAudienceFor shape.
                              So an admin account had no billing panel, and since 2026-10-22 the
                              retention sweep caps an admin's own training videos; the two
                              switches that lift that cap live only in this component, so there
                              was nowhere to tick them. The component decides now, from the
                              filming set, so a role added to that set gets its switches in the
                              same edit instead of silently going without. */}
                          <AdminBillingAssignment
                            userId={detail.id}
                            email={detail.email ?? ""}
                            role={detail.role}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      {data && users.length === data.limit && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          {t("Showing the first {count} results, narrow your search to see more.", { count: data.limit })}
        </p>
      )}

      <Dialog open={mfaResetTarget !== null} onOpenChange={(o) => !o && setMfaResetTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Reset MFA?")}</DialogTitle>
            <DialogDescription>
              {t("{name} will be able to log in with just their password until they set up MFA again. Use this only when they're actually locked out.", { name: mfaResetTarget?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMfaResetTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={resetMfaMutation.isPending}
              onClick={() => mfaResetTarget && resetMfaMutation.mutate(mfaResetTarget.id)}
            >
              {resetMfaMutation.isPending ? t("Resetting...") : t("Reset MFA")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleChangeTarget !== null} onOpenChange={(o) => !o && setRoleChangeTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("Change role?")}</DialogTitle>
            <DialogDescription>
              {roleChangeTarget?.role === "admin"
                ? t("{name} will become an {role}, effective immediately. This changes what they can see and do the next time they load the app.", { name: roleChangeTarget?.name, role: t("admin") })
                : t("{name} will become a {role}, effective immediately. This changes what they can see and do the next time they load the app.", { name: roleChangeTarget?.name, role: t(roleChangeTarget?.role ?? "") })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleChangeTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={roleChangeMutation.isPending}
              onClick={() => roleChangeTarget && roleChangeMutation.mutate(roleChangeTarget)}
            >
              {roleChangeMutation.isPending ? t("Changing...") : t("Change Role")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("truncate", mono && "font-mono")}>{value}</p>
    </div>
  );
}
