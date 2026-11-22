import { useState } from "react";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { shareOrDownloadBlob } from "@/lib/share-file";
import { cn } from "@/lib/utils";
import { Search, Sparkles, Download, Save, Trash2, ShieldCheck } from "lucide-react";
import { msg, useT } from "@/i18n";

/**
 * The Admin Query Engine.
 *
 * Everything behind this screen was already built: a 200-line query builder
 * (queryAthletesAdvanced), a 60-field filter schema, a natural-language translator
 * that can only ever emit that same typed filter object, CSV export, saved views,
 * and an integration test asserting the anonymity properties. No UI ever called any
 * of it, so the feature was invisible and its suppression floor and per-admin query
 * budget had never been exercised by a real user.
 *
 * Two invariants are stated on screen rather than left implicit in the server, because
 * an operator who does not know about them will read the results wrong:
 *
 * - Rows carry a subjectCode, never a name or an id. The code is an HMAC under a salt
 *   generated fresh per query, so it is stable within one result set and different in
 *   the next, and maps to nobody.
 * - A result set below the suppression floor comes back empty rather than partial,
 *   and every query costs one of a rolling-24h budget. The floor stops a filter being
 *   narrowed until one athlete matches; the budget is what stops the same answer
 *   being recovered by subtracting two queries that each passed the floor.
 */

type QueryRow = Record<string, string | number | boolean | null>;

type SavedView = { id: number; name: string; filters: Record<string, unknown> };

type Range = { min?: number; max?: number };

/** Grouped the way an admin thinks about them, not the way the schema lists them. */
const RANGE_GROUPS: { group: string; fields: { key: string; label: string }[] }[] = [
  {
    group: msg("Profile"),
    fields: [
      { key: "age", label: msg("Age") },
      { key: "bodyWeightLbs", label: msg("Body weight (lbs)") },
    ],
  },
  {
    group: msg("Testing"),
    fields: [
      { key: "fortyYardDash", label: msg("40-yard dash (s)") },
      { key: "proAgilitySeconds", label: msg("Pro agility (s)") },
      { key: "threeConeSeconds", label: msg("3-cone (s)") },
      { key: "verticalJumpIn", label: msg("Vertical jump (in)") },
      { key: "broadJumpIn", label: msg("Broad jump (in)") },
      { key: "benchMaxLbs", label: msg("Bench max (lbs)") },
      { key: "squatMaxLbs", label: msg("Squat max (lbs)") },
      { key: "deadliftMaxLbs", label: msg("Deadlift max (lbs)") },
    ],
  },
  {
    group: msg("Wellness (latest in window)"),
    fields: [
      { key: "soreness", label: msg("Soreness") },
      { key: "stress", label: msg("Stress") },
      { key: "sleepHours", label: msg("Sleep (h)") },
      { key: "hydration", label: msg("Hydration") },
      { key: "mentalFocus", label: msg("Mental focus") },
    ],
  },
  {
    group: msg("Tracked sets (in window)"),
    fields: [
      { key: "peakVelocityMps", label: msg("Best peak velocity (m/s)") },
      { key: "meanVelocityMps", label: msg("Avg mean velocity (m/s)") },
      { key: "romCm", label: msg("Avg ROM (cm)") },
      { key: "velocityLossPercent", label: msg("Avg velocity loss (%)") },
      { key: "minTrustScorePct", label: msg("Lowest trust score (%)") },
    ],
  },
  {
    group: msg("Compliance"),
    fields: [{ key: "caraCapUsagePercent", label: msg("CARA cap used (%, trailing 7d)") }],
  },
];

const LIST_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "sport", label: msg("Sport"), placeholder: "Football, Baseball" },
  { key: "position", label: msg("Position"), placeholder: "QB, WR" },
  { key: "seasonPhase", label: msg("Season phase"), placeholder: "in-season, off-season" },
  { key: "gender", label: msg("Gender"), placeholder: "male, female" },
  { key: "formFaultCodes", label: msg("Form fault codes"), placeholder: "knee_valgus" },
  { key: "skillFaultCodes", label: msg("Skill fault codes"), placeholder: "early_hip_rotation" },
];

export default function AdminQueryEngine() {
  const t = useT();
  const qc = useQueryClient();
  const [lookbackDays, setLookbackDays] = useState("30");
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [lists, setLists] = useState<Record<string, string>>({});
  const [healthStatus, setHealthStatus] = useState<string[]>([]);
  const [hasUnresolvedInjury, setHasUnresolvedInjury] = useState(false);
  const [hasFlaggedMovementScreen, setHasFlaggedMovementScreen] = useState(false);
  const [rows, setRows] = useState<QueryRow[] | null>(null);
  const [nlq, setNlq] = useState("");
  const [nlqUnderstood, setNlqUnderstood] = useState<Record<string, unknown> | null>(null);
  const [saveName, setSaveName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SavedView | null>(null);

  const { data: savedViews = [], isError: savedViewsFailed } = useQuery<SavedView[]>({
    queryKey: ["/api/admin/saved-views"],
    queryFn: () => getJson("/api/admin/saved-views"),
  });

  function buildFilters(): Record<string, unknown> {
    const filters: Record<string, unknown> = {
      lookbackDays: Number(lookbackDays) || 30,
    };
    for (const [key, r] of Object.entries(ranges)) {
      if (r.min != null || r.max != null) filters[key] = r;
    }
    for (const [key, raw] of Object.entries(lists)) {
      const values = raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (values.length) filters[key] = values;
    }
    if (healthStatus.length) filters.healthStatus = healthStatus;
    if (hasUnresolvedInjury) filters.hasUnresolvedInjury = true;
    if (hasFlaggedMovementScreen) filters.hasFlaggedMovementScreen = true;
    return filters;
  }

  /** Every filter state the panel can be in, so a saved view restores exactly. */
  function applyFilters(filters: Record<string, any>) {
    setLookbackDays(String(filters.lookbackDays ?? 30));
    const nextRanges: Record<string, Range> = {};
    const nextLists: Record<string, string> = {};
    for (const group of RANGE_GROUPS) {
      for (const f of group.fields) {
        if (filters[f.key]) nextRanges[f.key] = filters[f.key];
      }
    }
    for (const f of LIST_FIELDS) {
      if (Array.isArray(filters[f.key])) nextLists[f.key] = filters[f.key].join(", ");
    }
    setRanges(nextRanges);
    setLists(nextLists);
    setHealthStatus(filters.healthStatus ?? []);
    setHasUnresolvedInjury(Boolean(filters.hasUnresolvedInjury));
    setHasFlaggedMovementScreen(Boolean(filters.hasFlaggedMovementScreen));
  }

  const runQuery = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/athletes/query", buildFilters());
      return (await res.json()) as QueryRow[];
    },
    onSuccess: (result) => {
      setNlqUnderstood(null);
      setRows(result);
      if (result.length === 0) {
        // Empty has two meanings here and the difference matters, so say both.
        toast.info(t("No rows. Either nothing matched, or too few athletes did to report."));
      }
    },
    onError: (err: ApiError) =>
      toast.error(
        err.status === 429
          ? err.message || t("Daily query budget reached.")
          : err.message || t("Could not run that query"),
      ),
  });

  const runNlq = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/athletes/query/nlq", { prompt: nlq.trim() });
      return (await res.json()) as { filters: Record<string, unknown>; rows: QueryRow[] };
    },
    onSuccess: (result) => {
      // Show what it understood before the rows, not after: the filters are the part
      // an admin has to agree with before the list means anything.
      setNlqUnderstood(result.filters);
      applyFilters(result.filters);
      setRows(result.rows);
    },
    onError: (err: ApiError) =>
      toast.error(
        err.status === 429
          ? err.message || t("Daily query budget reached.")
          : err.message || t("Couldn't understand that search"),
      ),
  });

  const saveView = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/saved-views", {
        name: saveName.trim(),
        filters: buildFilters(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/saved-views"] });
      toast.success(t("View saved"));
      setSaveName("");
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not save that view")),
  });

  const deleteView = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/saved-views/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/saved-views"] });
      toast.success(t("View deleted"));
      setDeleteTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not delete that view")),
  });

  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/athletes/query?format=csv", buildFilters());
      await shareOrDownloadBlob(
        await res.blob(),
        "athlete-query-results.csv",
        "Forge query results",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Could not export those rows"));
    } finally {
      setExporting(false);
    }
  }

  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <AppShell title={t("Query Engine")}>
      <div className="mt-4 space-y-4">
        {/* Five of the selectable fields -- peak and mean velocity, ROM, velocity loss, trust
            score -- are camera-derived, and an operator querying a cohort on them is further
            from the footage than anybody else in the app. There is no set in front of them to
            sanity-check against, only a number in a column. Permanent rather than dismissible:
            this is not a surface anyone opens every session, and a conclusion drawn here tends
            to leave the room. */}
        <CameraMetricCaveat className="mb-1" />
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">{t("Rows identify nobody.")}</span> {t("Each carries a subject code derived under a salt generated fresh for this query, stable within one result, different in the next, and mapped nowhere.")}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  {t("A result too small to report comes back empty,")}
                </span>{" "}
                {t("not partial, so a filter cannot be narrowed until one athlete matches. Each query also spends one of a rolling 24-hour budget, which is what stops the same answer being recovered by subtracting two queries that each passed the floor.")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              {t("Ask in words")}
            </CardTitle>
            <CardDescription>
              {t("Translated into the same filters as the panel below, which is the only thing it can produce. Check what it understood before you trust the rows.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={nlq}
                onChange={(e) => setNlq(e.target.value)}
                placeholder={t("football athletes under 18 with high soreness and a flagged movement screen")}
                onKeyDown={(e) => e.key === "Enter" && nlq.trim() && runNlq.mutate()}
              />
              <Button onClick={() => runNlq.mutate()} disabled={runNlq.isPending || !nlq.trim()}>
                {runNlq.isPending ? t("Asking…") : t("Ask")}
              </Button>
            </div>
            {nlqUnderstood && (
              <div className="rounded-md bg-surface-elevated p-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("Understood as")}
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                  {JSON.stringify(nlqUnderstood, null, 1)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Filters")}</CardTitle>
            <CardDescription>
              {t("Leave anything blank to ignore it. The window applies to repeated measures, sets, wellness check-ins, skill captures, not to profile values or an unresolved injury, which are true today whenever they were recorded.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lookback" className="text-xs">
                  {t("Window (days)")}
                </Label>
                <Input
                  id="lookback"
                  type="number"
                  min={1}
                  max={365}
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Health status")}</Label>
                <div className="flex gap-3">
                  {(["healthy", "hurt"] as const).map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-xs capitalize">
                      <Checkbox
                        checked={healthStatus.includes(s)}
                        onCheckedChange={(c) =>
                          setHealthStatus((prev) =>
                            c === true ? [...prev, s] : prev.filter((x) => x !== s),
                          )
                        }
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={hasUnresolvedInjury}
                  onCheckedChange={(c) => setHasUnresolvedInjury(c === true)}
                />
                {t("Unresolved injury")}
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={hasFlaggedMovementScreen}
                  onCheckedChange={(c) => setHasFlaggedMovementScreen(c === true)}
                />
                {t("Flagged movement screen")}
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LIST_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">{t(f.label)}</Label>
                  <Input
                    value={lists[f.key] ?? ""}
                    onChange={(e) => setLists((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="text-xs"
                  />
                </div>
              ))}
            </div>

            {RANGE_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(group.group)}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.fields.map((f) => (
                    <div key={f.key} className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {t(f.label)}
                      </span>
                      <Input
                        type="number"
                        aria-label={t("{field} minimum", { field: t(f.label) })}
                        placeholder={t("min")}
                        value={ranges[f.key]?.min ?? ""}
                        onChange={(e) =>
                          setRanges((prev) => ({
                            ...prev,
                            [f.key]: {
                              ...prev[f.key],
                              min: e.target.value === "" ? undefined : Number(e.target.value),
                            },
                          }))
                        }
                        className="h-8 w-20 text-xs"
                      />
                      <Input
                        type="number"
                        aria-label={t("{field} maximum", { field: t(f.label) })}
                        placeholder={t("max")}
                        value={ranges[f.key]?.max ?? ""}
                        onChange={(e) =>
                          setRanges((prev) => ({
                            ...prev,
                            [f.key]: {
                              ...prev[f.key],
                              max: e.target.value === "" ? undefined : Number(e.target.value),
                            },
                          }))
                        }
                        className="h-8 w-20 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button onClick={() => runQuery.mutate()} disabled={runQuery.isPending}>
                <Search className="h-4 w-4" />
                {runQuery.isPending ? t("Running…") : t("Run query")}
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={exporting}>
                <Download className="h-4 w-4" />
                {exporting ? t("Exporting…") : t("Export CSV")}
              </Button>
              <div className="ml-auto flex items-center gap-1.5">
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t("Save these filters as…")}
                  className="w-48 text-xs"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!saveName.trim() || saveView.isPending}
                  onClick={() => saveView.mutate()}
                >
                  <Save className="h-3.5 w-3.5" />
                  {t("Save")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The results below come from a MUTATION, not a query, and their "either nothing
            matched or too few did to report" wording is deliberate suppression rather than
            a failed read -- nothing to fix there. This card is the page's only real read,
            and a failure silently removes it, so a saved view looks deleted. */}
        {savedViewsFailed && (
          <p className="text-sm text-muted-foreground">
            {t("We couldn't load your saved views. They haven't been deleted.")}
          </p>
        )}

        {savedViews.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("Saved views")}</CardTitle>
              <CardDescription>
                {t("Filter combinations worth re-running. Loading one fills the panel above; it does not run until you say so, since every run spends budget.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {savedViews.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-1 rounded-full border border-border pl-3 pr-1 text-xs"
                >
                  <button
                    type="button"
                    className="py-1 font-semibold hover:text-primary"
                    onClick={() => {
                      applyFilters(v.filters as Record<string, any>);
                      toast.success(t("Loaded \"{name}\"", { name: v.name }));
                    }}
                  >
                    {v.name}
                  </button>
                  <button
                    type="button"
                    aria-label={t("Delete {name}", { name: v.name })}
                    className="rounded-full p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(v)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {rows !== null && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {t("Results")}
                <Badge variant="secondary">{rows.length}</Badge>
              </CardTitle>
              {rows.length === 0 && (
                <CardDescription>
                  {t("Nothing to show. That means either no athlete matched, or too few did to report, the two are deliberately indistinguishable from here.")}
                </CardDescription>
              )}
            </CardHeader>
            {rows.length > 0 && (
              <CardContent>
                {/* Its own horizontal scroll: 30-odd columns will never fit a phone, and
                    the page body must not scroll sideways. */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        {columns.map((c) => (
                          <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          {columns.map((c) => (
                            <td
                              key={c}
                              className={cn(
                                "whitespace-nowrap px-2 py-1.5 tabular-nums",
                                c === "subjectCode" && "font-mono font-semibold",
                              )}
                            >
                              {row[c] === null
                                ? "--"
                                : typeof row[c] === "boolean"
                                  ? row[c]
                                    ? t("yes")
                                    : t("no")
                                  : String(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("Delete this saved view?")}
        description={
          deleteTarget ? t("\"{name}\" will be removed for every admin.", { name: deleteTarget.name }) : ""
        }
        confirmLabel={t("Delete")}
        isPending={deleteView.isPending}
        onConfirm={() => deleteTarget && deleteView.mutate(deleteTarget.id)}
      />
    </AppShell>
  );
}
