/** DEVICES (2026-11-21): connect a force plate or a velocity device so its readings land in
 * Forge on their own, link the device's athletes Forge could not match, and upload a CSV from a
 * device with no API. The rules are in shared/device-integrations.ts; the routes in
 * server/device-integrations.ts.
 *
 * A device's numbers are the device's own and are labelled with its name. They carry no camera
 * accuracy caveat because they are not camera numbers. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson } from "@/lib/queryClient";
import {
  CSV_FIELDS,
  CSV_FIELD_LABELS,
  type CsvField,
  type CsvMapping,
  type HeightUnit,
  type LoadUnit,
  type ReadingNumbers,
  type VendorInfo,
} from "@shared/device-integrations";
import { toast } from "sonner";

type Connection = { id: number; vendor: string; name: string; status: string; lastSyncedAt: string | null; lastError: string | null };
type Unmatched = { linkId: number; connectionId: number; vendor: string; vendorAthleteName: string | null };
type Linked = Unmatched & { athleteId: number; athleteName: string | null; matchedBy: string | null; consentSentence: string | null };
type DevicesPage = {
  canManage: boolean;
  vendors: VendorInfo[];
  connections: Connection[];
  unmatched: Unmatched[];
  linked: Linked[];
  roster: { id: number; name: string }[];
};

const QUERY_KEY = ["/api/coach/devices"];

const STATUS_LABEL: Record<string, string> = {
  active: "Connected",
  error: "Needs attention",
  awaiting_partner_access: "Awaiting partner access",
};

const NATIVE_SELECT = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "never";
}

function ConnectCard({ vendor, connected }: { vendor: VendorInfo; connected: Connection | undefined }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const connect = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/coach/devices/connections", { vendor: vendor.vendor, credentials: values })).json(),
    onSuccess: (data: { sync: { status: string; stored: number; message: string | null } }) => {
      setValues({});
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast(
        data.sync.status === "awaiting_partner_access"
          ? (data.sync.message ?? "Saved.")
          : `${vendor.name} connected. ${data.sync.stored} new reading${data.sync.stored === 1 ? "" : "s"}.`,
      );
    },
    onError: (err) => toast.error(messageOf(err)),
  });
  return (
    <div className="space-y-2 rounded-md border p-3" data-testid={`device-connect-${vendor.vendor}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{vendor.name}</p>
          <p className="text-xs text-muted-foreground">{vendor.measures}</p>
        </div>
        {!vendor.syncsToday && <Badge variant="secondary">Awaiting partner access</Badge>}
        {connected && <Badge>Connected</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">{vendor.whereToFindIt}</p>
      {vendor.fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label htmlFor={`${vendor.vendor}-${f.key}`}>{f.label}</Label>
          <Input
            id={`${vendor.vendor}-${f.key}`}
            type={f.secret ? "password" : "text"}
            autoComplete="off"
            value={values[f.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <Button size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}>
        {connected ? "Replace key" : "Connect"}
      </Button>
    </div>
  );
}

function ConnectionRow({ c, canManage }: { c: Connection; canManage: boolean }) {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/coach/devices/connections/${c.id}/sync`)).json(),
    onSuccess: (data: { status: string; stored: number; unmatchedReadings: number; message: string | null }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      if (data.status === "error") toast.error(data.message ?? "The sync failed.");
      else toast(`${data.stored} new reading${data.stored === 1 ? "" : "s"}${data.unmatchedReadings ? `, ${data.unmatchedReadings} waiting for an athlete link` : ""}.`);
    },
    onError: (err) => toast.error(messageOf(err)),
  });
  const disconnect = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/coach/devices/connections/${c.id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (err) => toast.error(messageOf(err)),
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3" data-testid={`device-connection-${c.vendor}`}>
      <div className="min-w-0">
        <p className="font-medium">
          {c.name} <Badge variant={c.status === "error" ? "destructive" : "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
        </p>
        <p className="text-xs text-muted-foreground">Last synced {when(c.lastSyncedAt)}</p>
        {c.lastError && <p className="text-xs text-muted-foreground">{c.lastError}</p>}
      </div>
      <div className="flex gap-2">
        {c.status !== "awaiting_partner_access" && (
          <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
        )}
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}

function LinkPicker({ link, roster }: { link: Unmatched; roster: DevicesPage["roster"] }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: async (athleteId: number) => apiRequest("PUT", `/api/coach/devices/links/${link.linkId}`, { athleteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast("Linked. Their readings arrive on the next sync.");
    },
    onError: (err) => toast.error(messageOf(err)),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 py-1" data-testid={`device-unmatched-${link.linkId}`}>
      <span className="min-w-0 flex-1 text-sm">{link.vendorAthleteName ?? "Unnamed athlete"}</span>
      <select
        className={`${NATIVE_SELECT} max-w-[220px]`}
        defaultValue=""
        onChange={(e) => e.target.value && save.mutate(Number(e.target.value))}
        aria-label={`Forge athlete for ${link.vendorAthleteName ?? "this device athlete"}`}
      >
        <option value="">Pick the Forge athlete…</option>
        {roster.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type PreviewRow = {
  rowNumber: number;
  athleteName: string | null;
  athleteEmail: string | null;
  recordedAt: string | null;
  exerciseName: string | null;
  athleteId: number | null;
  athleteDisplayName: string | null;
  problem: string | null;
  consentSentence: string | null;
  numbers: ReadingNumbers;
};
type Preview = {
  headers: string[];
  mapping: CsvMapping;
  truncated: boolean;
  totals: { rows: number; ready: number; unmatched: number; problems: number; consent: number };
  rows: PreviewRow[];
  unmatchedRows: { rowNumber: number; athleteName: string | null; athleteEmail: string | null }[];
};

const VELOCITY_DIGITS = 2;
const fmt = (v: number | null) => (v == null ? "–" : v.toFixed(VELOCITY_DIGITS));

function CsvUpload({ roster }: { roster: DevicesPage["roster"] }) {
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [loadUnit, setLoadUnit] = useState<LoadUnit>("lb");
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("cm");
  const [mapping, setMapping] = useState<CsvMapping | undefined>(undefined);
  const [athleteForRow, setAthleteForRow] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const body = (m: CsvMapping | undefined) => ({ csv, deviceName, loadUnit, heightUnit, mapping: m, athleteForRow });

  const runPreview = useMutation({
    mutationFn: async (m: CsvMapping | undefined) => (await apiRequest("POST", "/api/coach/devices/csv/preview", body(m))).json() as Promise<Preview>,
    onSuccess: (p) => {
      setPreview(p);
      setMapping(p.mapping);
    },
    onError: (err) => toast.error(messageOf(err)),
  });
  const runImport = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/coach/devices/csv/import", body(mapping))).json(),
    onSuccess: (r: { imported: number; alreadyHad: number; notImported: { rowNumber: number }[] }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast(`${r.imported} imported, ${r.alreadyHad} already in Forge, ${r.notImported.length} not imported (listed below).`);
      runPreview.mutate(mapping);
    },
    onError: (err) => toast.error(messageOf(err)),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setCsv(await file.text());
    setPreview(null);
    setMapping(undefined);
    setAthleteForRow({});
  };
  const setField = (field: CsvField, header: string) => {
    const next = { ...(mapping ?? {}) };
    if (header) next[field] = header;
    else delete next[field];
    setMapping(next);
    runPreview.mutate(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a CSV</CardTitle>
        <CardDescription>
          For OVR Velocity, Vitruve, Perch or any device that exports a spreadsheet. Map the columns, check the preview, then import. A
          second upload of the same file adds nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="csv-file">File</Label>
            <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="csv-device">Device name (shown on every reading)</Label>
            <Input id="csv-device" placeholder="OVR Velocity" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="csv-load">Load is in</Label>
            <select id="csv-load" className={NATIVE_SELECT} value={loadUnit} onChange={(e) => setLoadUnit(e.target.value as LoadUnit)}>
              <option value="lb">pounds</option>
              <option value="kg">kilograms</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="csv-height">Jump height is in</Label>
            <select id="csv-height" className={NATIVE_SELECT} value={heightUnit} onChange={(e) => setHeightUnit(e.target.value as HeightUnit)}>
              <option value="cm">centimetres</option>
              <option value="in">inches</option>
              <option value="m">metres</option>
            </select>
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={!csv || runPreview.isPending} onClick={() => runPreview.mutate(mapping)}>
          Preview
        </Button>

        {preview && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {CSV_FIELDS.map((field) => (
                <div key={field} className="flex items-center gap-2">
                  <Label className="w-40 shrink-0 text-xs">{CSV_FIELD_LABELS[field]}</Label>
                  <select
                    className={NATIVE_SELECT}
                    value={preview.mapping[field] ?? ""}
                    onChange={(e) => setField(field, e.target.value)}
                    aria-label={`Column for ${CSV_FIELD_LABELS[field]}`}
                  >
                    <option value="">Not in this file</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-sm" data-testid="csv-totals">
              {preview.totals.rows} rows: {preview.totals.ready} ready, {preview.totals.unmatched} not matched to an athlete,{" "}
              {preview.totals.problems} with a problem, {preview.totals.consent} withheld for consent.
              {preview.truncated ? " Only the first 5,000 rows are read." : ""}
            </p>
            {preview.unmatchedRows.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Rows no Forge athlete matched</p>
                {preview.unmatchedRows.map((r) => (
                  <div key={r.rowNumber} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-sm">
                      Line {r.rowNumber}: {r.athleteName ?? r.athleteEmail ?? "no name"}
                    </span>
                    <select
                      className={`${NATIVE_SELECT} max-w-[220px]`}
                      value={athleteForRow[String(r.rowNumber)] ?? ""}
                      onChange={(e) => setAthleteForRow((m) => ({ ...m, [String(r.rowNumber)]: Number(e.target.value) }))}
                      aria-label={`Forge athlete for line ${r.rowNumber}`}
                    >
                      <option value="">Pick the Forge athlete…</option>
                      {roster.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="p-1">Line</th>
                    <th className="p-1">Athlete</th>
                    <th className="p-1">Date</th>
                    <th className="p-1">Exercise</th>
                    <th className="p-1">Mean m/s</th>
                    <th className="p-1">Peak m/s</th>
                    <th className="p-1">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.rowNumber} className="border-t">
                      <td className="p-1">{r.rowNumber}</td>
                      <td className="p-1">{r.athleteDisplayName ?? r.athleteName ?? r.athleteEmail ?? "–"}</td>
                      <td className="p-1">{r.recordedAt ? new Date(r.recordedAt).toLocaleString() : "–"}</td>
                      <td className="p-1">{r.exerciseName ?? "–"}</td>
                      <td className="p-1">{fmt(r.numbers.meanVelocityMps)}</td>
                      <td className="p-1">{fmt(r.numbers.peakVelocityMps)}</td>
                      <td className="p-1 text-muted-foreground">{r.consentSentence ?? r.problem ?? (r.athleteId ? "" : "No athlete matched")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button size="sm" disabled={runImport.isPending || !preview.mapping.date} onClick={() => runImport.mutate()}>
              Import ready rows
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CoachDevices() {
  const page = useQuery<DevicesPage>({ queryKey: QUERY_KEY, queryFn: () => getJson("/api/coach/devices") });
  return (
    <AppShell title="Devices">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        {page.isError && <ReadFailed what="your connected devices" onRetry={() => void page.refetch()} error={page.error} />}
        {!page.isError && !page.data && <p className="text-sm text-muted-foreground">Loading…</p>}
        {page.data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Connected devices</CardTitle>
                <CardDescription>
                  Readings sync every ten minutes. A device's numbers are its own and are shown with its name. Forge stores nothing for an
                  athlete who has turned tracking off or has no video and biometric consent on file.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {page.data.connections.length === 0 && <p className="text-sm text-muted-foreground">No device connected yet.</p>}
                {page.data.connections.map((c) => (
                  <ConnectionRow key={c.id} c={c} canManage={page.data.canManage} />
                ))}
              </CardContent>
            </Card>

            {(page.data.unmatched.length > 0 || page.data.linked.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Athletes on your devices</CardTitle>
                  <CardDescription>
                    Forge matches a device's athlete by email, then by exact name. Anyone it could not match is listed here for you to
                    link; Forge never guesses.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {page.data.unmatched.map((u) => (
                    <LinkPicker key={u.linkId} link={u} roster={page.data.roster} />
                  ))}
                  {page.data.linked.map((l) => (
                    <div key={l.linkId} className="text-sm">
                      <span className="font-medium">{l.vendorAthleteName ?? "Unnamed"}</span> is {l.athleteName ?? "a Forge athlete"}
                      {l.consentSentence && <p className="text-xs text-muted-foreground">{l.consentSentence}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {page.data.canManage ? (
              <Card>
                <CardHeader>
                  <CardTitle>Connect a device</CardTitle>
                  <CardDescription>Keys are stored encrypted and never shown again.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {page.data.vendors
                    .filter((v) => v.vendor !== "csv")
                    .map((v) => (
                      <ConnectCard key={v.vendor} vendor={v} connected={page.data.connections.find((c) => c.vendor === v.vendor)} />
                    ))}
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">Your head coach connects devices for the program.</p>
            )}

            <CsvUpload roster={page.data.roster} />
          </>
        )}
      </div>
    </AppShell>
  );
}
