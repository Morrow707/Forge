import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: "coach" | "athlete" | "admin" | "guardian";
  createdAt: string;
  lastActivityAt: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  sport: string | null;
};

type UserDetail = UserRow & {
  coachCode: string | null;
  staffInviteCode: string | null;
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
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ id: number; name: string; role: string } | null>(
    null,
  );
  const [mfaResetTarget, setMfaResetTarget] = useState<{ id: number; name: string } | null>(null);

  const { data, isLoading } = useQuery<{ users: UserRow[]; limit: number }>({
    queryKey: ["/api/admin/users", appliedSearch, roleFilter],
    queryFn: () =>
      getJson(
        `/api/admin/users?search=${encodeURIComponent(appliedSearch)}${roleFilter !== "all" ? `&role=${roleFilter}` : ""}`,
      ),
  });

  const { data: detail } = useQuery<UserDetail>({
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
      toast.success("MFA reset -- they can log in with just their password now");
      setMfaResetTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't reset MFA"),
  });

  const roleChangeMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${id}/role`, { role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast.success("Role updated");
      setRoleChangeTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't change that account's role"),
  });

  const users = data?.users ?? [];

  return (
    <AppShell title="Users">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(searchInput.trim())}
            placeholder="Search by name or email..."
            className="pl-8"
            aria-label="Search users"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setAppliedSearch(searchInput.trim())}>
          Search
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
              {r}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {isLoading ? (
            <div className="h-40 animate-pulse bg-surface" />
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <UsersIcon className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No accounts match that search.</p>
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
                        <span className="truncate text-sm font-semibold">{u.name}</span>
                        <Badge className={cn("border-none text-[10px] capitalize", ROLE_BADGE_CLASS[u.role])}>
                          {u.role}
                        </Badge>
                        {!u.emailVerified && (
                          <MailWarning className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Email not verified" />
                        )}
                        {u.mfaEnabled && (
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-label="MFA enabled" />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <p>Joined {new Date(u.createdAt).toLocaleDateString()}</p>
                      <p>
                        {u.lastActivityAt
                          ? `Active ${new Date(u.lastActivityAt).toLocaleDateString()}`
                          : "No activity yet"}
                      </p>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border bg-surface-elevated/50 p-4">
                      {!detail || detail.id !== u.id ? (
                        <div className="h-16 animate-pulse rounded-md bg-surface" />
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                            <DetailField label="User ID" value={String(detail.id)} />
                            <DetailField label="Email verified" value={detail.emailVerified ? "Yes" : "No"} />
                            <DetailField label="MFA enabled" value={detail.mfaEnabled ? "Yes" : "No"} />
                            {detail.role === "coach" && (
                              <>
                                <DetailField label="Coach code" value={detail.coachCode ?? "--"} mono />
                                <DetailField label="Staff invite code" value={detail.staffInviteCode ?? "--"} mono />
                                <DetailField label="Billing tier" value={detail.billingTier ?? "none"} />
                              </>
                            )}
                            {detail.role === "athlete" && (
                              <>
                                <DetailField label="Sport / Position" value={[detail.sport, detail.position].filter(Boolean).join(" / ") || "--"} />
                                <DetailField label="Free Agent tier" value={detail.freeAgentTier ?? "coached"} />
                                <DetailField
                                  label="Provisioned via coach consent"
                                  value={detail.provisionedViaCoachConsent ? "Yes" : "No"}
                                />
                                <DetailField
                                  label="Requires guardian notice"
                                  value={detail.requiresGuardianNotice ? "Yes" : "No"}
                                />
                                <DetailField label="Tracking opted out" value={detail.trackingOptOut ? "Yes" : "No"} />
                              </>
                            )}
                            <DetailField label="Beta account" value={detail.isBetaAccount ? "Yes" : "No"} />
                            {detail.trialExpiresAt && (
                              <DetailField
                                label="Trial expires"
                                value={new Date(detail.trialExpiresAt).toLocaleDateString()}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMfaResetTarget({ id: detail.id, name: detail.name })}
                              disabled={!detail.mfaEnabled}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Reset MFA
                            </Button>
                            {detail.role !== "guardian" && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">Change role:</span>
                                <Select
                                  value=""
                                  onValueChange={(role) =>
                                    setRoleChangeTarget({ id: detail.id, name: detail.name, role })
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
                                          {r}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
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
          Showing the first {data.limit} results -- narrow your search to see more.
        </p>
      )}

      <Dialog open={mfaResetTarget !== null} onOpenChange={(o) => !o && setMfaResetTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset MFA?</DialogTitle>
            <DialogDescription>
              {mfaResetTarget?.name} will be able to log in with just their password until they set
              up MFA again. Use this only when they're actually locked out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMfaResetTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={resetMfaMutation.isPending}
              onClick={() => mfaResetTarget && resetMfaMutation.mutate(mfaResetTarget.id)}
            >
              {resetMfaMutation.isPending ? "Resetting..." : "Reset MFA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleChangeTarget !== null} onOpenChange={(o) => !o && setRoleChangeTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change role?</DialogTitle>
            <DialogDescription>
              {roleChangeTarget?.name} will become a{roleChangeTarget?.role === "admin" ? "n" : ""}{" "}
              <strong className="capitalize">{roleChangeTarget?.role}</strong>, effective immediately
              -- this changes what they can see and do the next time they load the app.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRoleChangeTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={roleChangeMutation.isPending}
              onClick={() => roleChangeTarget && roleChangeMutation.mutate(roleChangeTarget)}
            >
              {roleChangeMutation.isPending ? "Changing..." : "Change Role"}
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
