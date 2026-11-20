import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError, apiRequest, getJson, resolveApiUrl } from "@/lib/queryClient";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { ColorField } from "@/components/color-field";
import { FontPicker } from "@/components/font-picker";
import {
  BRAND_APP_ICONS,
  BRAND_BODY_FONTS,
  BRAND_TERM_KEYS,
  FORGE_TERMS,
  type BrandExtras,
  type BrandTermKey,
} from "@shared/brand-extras";

/** The athlete dashboard's cards, in Forge's own order (athlete/dashboard.tsx WIDGET_IDS). */
const ATHLETE_WIDGETS: { id: string; label: string }[] = [
  { id: "next-3-days", label: "Next 3 days" },
  { id: "nutrition-summary", label: "Today's nutrition" },
  { id: "stat-tiles", label: "Stats" },
  { id: "team-chat", label: "Team chat" },
];

type Terms = Partial<Record<BrandTermKey, { one: string; many: string }>>;
const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** EVERYTHING ELSE A PROGRAM CAN MAKE ITS OWN (shared/brand-extras.ts, 2026-11-19): its words,
 *  the rest of its look, its athletes' dashboard, the coach's note, a banner, a celebration and
 *  the app icon. One Save for the lot; anything the program's plan does not include is skipped by
 *  the server and named in the toast. */
export function BrandExtrasEditor({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ brandExtras?: BrandExtras | null; brandTeamName?: string | null; brandPrimaryColor?: string | null }>({
    queryKey: ["/api/coach/branding"],
    queryFn: () => getJson("/api/coach/branding"),
  });
  const saved = data?.brandExtras ?? null;
  // A picked wordmark or background waits in the crop dialog until the coach presses Save.
  const [pendingImage, setPendingImage] = useState<{ kind: "wordmark" | "background"; file: File } | null>(null);
  const [uploading, setUploading] = useState(false);

  const [terms, setTerms] = useState<Terms>({});
  const [greeting, setGreeting] = useState("");
  const [restDay, setRestDay] = useState("");
  const [workoutDone, setWorkoutDone] = useState("");
  const [defaultTheme, setDefaultTheme] = useState<"" | "dark" | "light">("");
  const [corners, setCorners] = useState<"" | "square" | "standard" | "round">("");
  const [pillButtons, setPillButtons] = useState(false);
  const [bodyFont, setBodyFont] = useState("");
  const [order, setOrder] = useState<string[]>(ATHLETE_WIDGETS.map((w) => w.id));
  const [hidden, setHidden] = useState<string[]>([]);
  const [useLayout, setUseLayout] = useState(false);
  const [coachNote, setCoachNote] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [announcementUntil, setAnnouncementUntil] = useState("");
  const [cheer, setCheer] = useState("");
  const [cheerColor, setCheerColor] = useState("");
  const [appIcon, setAppIcon] = useState("forge");
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setTerms((saved?.terms ?? {}) as Terms);
    setGreeting(saved?.wording?.greeting ?? "");
    setRestDay(saved?.wording?.restDay ?? "");
    setWorkoutDone(saved?.wording?.workoutDone ?? "");
    setDefaultTheme(saved?.defaultTheme ?? "");
    setCorners(saved?.corners ?? "");
    setPillButtons(!!saved?.pillButtons);
    setBodyFont(saved?.bodyFont ?? "");
    if (saved?.athleteDashboard) {
      setUseLayout(true);
      const known = saved.athleteDashboard.order.filter((id) => ATHLETE_WIDGETS.some((w) => w.id === id));
      setOrder([...known, ...ATHLETE_WIDGETS.map((w) => w.id).filter((id) => !known.includes(id))]);
      setHidden(saved.athleteDashboard.hidden);
    }
    setCoachNote(saved?.coachNote ?? "");
    setAnnouncement(saved?.announcement?.text ?? "");
    setAnnouncementUntil(saved?.announcement?.until ?? "");
    setCheer(saved?.celebration?.message ?? "");
    setCheerColor(saved?.celebration?.color ?? "");
    setAppIcon(saved?.appIcon ?? "forge");
  }, [data, saved]);

  const save = useMutation({
    mutationFn: async () => {
      const cleanTerms = Object.fromEntries(
        Object.entries(terms).filter(([, t]) => t && t.one.trim() && t.many.trim()),
      ) as Terms;
      const body: BrandExtras = {
        terms: Object.keys(cleanTerms).length ? cleanTerms : null,
        wording: blank(greeting) || blank(restDay) || blank(workoutDone)
          ? { greeting: blank(greeting), restDay: blank(restDay), workoutDone: blank(workoutDone) }
          : null,
        defaultTheme: defaultTheme || null,
        corners: corners || null,
        pillButtons: pillButtons || null,
        bodyFont: (bodyFont || null) as BrandExtras["bodyFont"],
        athleteDashboard: useLayout ? { order, hidden } : null,
        coachNote: blank(coachNote),
        announcement: blank(announcement) ? { text: announcement.trim(), until: announcementUntil || null } : null,
        celebration: blank(cheer) || cheerColor ? { message: blank(cheer), color: cheerColor || null } : null,
        appIcon: appIcon === "forge" ? null : (appIcon as BrandExtras["appIcon"]),
      };
      const res = await apiRequest("PATCH", "/api/coach/branding/extras", body);
      return (await res.json()) as { skipped: string[] };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/branding"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      if (result.skipped.length) {
        toast.info("Saved. Some options need Full Personalization, so they were left as they were.");
      } else {
        toast.success("Saved");
      }
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save"),
  });

  async function upload(kind: "wordmark" | "background", file: File) {
    const form = new FormData();
    form.append("image", file);
    setUploading(true);
    try {
      await apiRequest("POST", `/api/coach/branding/${kind}`, form);
      setPendingImage(null);
      qc.invalidateQueries({ queryKey: ["/api/coach/branding"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      toast.success(kind === "wordmark" ? "Wordmark uploaded" : "Background uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  async function removeImage(field: "wordmarkUrl" | "backgroundImageUrl") {
    try {
      await apiRequest("PATCH", "/api/coach/branding/extras", { [field]: null });
      qc.invalidateQueries({ queryKey: ["/api/coach/branding"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove it");
    }
  }

  const move = (id: string, by: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(id);
      const j = i + by;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  return (
    <Card className="mt-6" data-testid="brand-extras-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs text-primary">6</span>
          Your words, your look, your dashboard
        </CardTitle>
        <CardDescription>
          Part of Full Personalization. Anything left blank stays Forge's. Changes reach your athletes the next
          time their app loads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-3">
          <h3 className="font-semibold">Words</h3>
          <p className="text-sm text-muted-foreground">
            Your names for Forge's words, in tabs, page titles and buttons. For example, call a Program a Block.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {BRAND_TERM_KEYS.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label>{FORGE_TERMS[key].one} / {FORGE_TERMS[key].many}</Label>
                <div className="flex gap-2">
                  <Input
                    aria-label={`${FORGE_TERMS[key].one}, one`}
                    placeholder={FORGE_TERMS[key].one}
                    value={terms[key]?.one ?? ""}
                    maxLength={24}
                    disabled={!canEdit}
                    onChange={(e) => setTerms((t) => ({ ...t, [key]: { one: e.target.value, many: t[key]?.many ?? "" } }))}
                  />
                  <Input
                    aria-label={`${FORGE_TERMS[key].many}, more than one`}
                    placeholder={FORGE_TERMS[key].many}
                    value={terms[key]?.many ?? ""}
                    maxLength={24}
                    disabled={!canEdit}
                    onChange={(e) => setTerms((t) => ({ ...t, [key]: { one: t[key]?.one ?? "", many: e.target.value } }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bx-greeting">Dashboard greeting</Label>
              <Input id="bx-greeting" value={greeting} maxLength={140} disabled={!canEdit} placeholder="Welcome  (use {name} for the athlete's first name)" onChange={(e) => setGreeting(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bx-rest">A day with nothing on it</Label>
              <Input id="bx-rest" value={restDay} maxLength={140} disabled={!canEdit} placeholder="Nothing scheduled" onChange={(e) => setRestDay(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bx-done">When a workout is finished</Label>
              <Input id="bx-done" value={workoutDone} maxLength={140} disabled={!canEdit} placeholder="e.g. Go Falcons. Recover well tonight." onChange={(e) => setWorkoutDone(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Look</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bx-theme">Default for your athletes</Label>
              <select id="bx-theme" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={defaultTheme} disabled={!canEdit} onChange={(e) => setDefaultTheme(e.target.value as typeof defaultTheme)}>
                <option value="">Dark (Forge's)</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <p className="text-xs text-muted-foreground">An athlete who picks their own keeps theirs.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bx-corners">Corners</Label>
              <select id="bx-corners" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={corners} disabled={!canEdit} onChange={(e) => setCorners(e.target.value as typeof corners)}>
                <option value="">Forge's</option>
                <option value="square">Square</option>
                <option value="standard">Standard</option>
                <option value="round">Round</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-full">
              <Label>Body text font</Label>
              <FontPicker
                fonts={BRAND_BODY_FONTS}
                kind="body"
                value={bodyFont || "inter"}
                onChange={(id) => setBodyFont(id === "inter" ? "" : id)}
                sample="The quick athlete jumps"
                disabled={!canEdit}
              />
            </div>
            <label className="flex items-center gap-2 pt-7 text-sm">
              <Checkbox checked={pillButtons} disabled={!canEdit} onCheckedChange={(v) => setPillButtons(v === true)} />
              Pill-shaped buttons
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["wordmark", "wordmarkUrl", "Wide wordmark", "Replaces the logo and name in the app header and on your login screen."],
              ["background", "backgroundImageUrl", "Login background photo", "Behind your login screen and public page, darkened so text stays readable."],
            ] as const).map(([kind, field, label, hint]) => (
              <div key={kind} className="space-y-1.5">
                <Label>{label}</Label>
                {saved?.[field] && (
                  <img src={resolveApiUrl(saved[field]!)} alt="" className="h-16 max-w-full rounded-md border border-border object-contain" />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!canEdit} asChild>
                    <label className="cursor-pointer">
                      <ImagePlus className="h-4 w-4" /> Upload
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPendingImage({ kind, file: f }); }} />
                    </label>
                  </Button>
                  {saved?.[field] && (
                    <Button type="button" variant="ghost" size="sm" disabled={!canEdit} onClick={() => removeImage(field)}>
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Your athletes' dashboard</h3>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={useLayout} disabled={!canEdit} onCheckedChange={(v) => setUseLayout(v === true)} />
            Set the order and cards your athletes start with
          </label>
          {useLayout && (
            <ul className="space-y-2">
              {order.map((id, i) => {
                const w = ATHLETE_WIDGETS.find((x) => x.id === id)!;
                return (
                  <li key={id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span className="flex-1">{w.label}</span>
                    <label className="flex items-center gap-1.5 text-xs">
                      <Checkbox checked={!hidden.includes(id)} disabled={!canEdit} onCheckedChange={(v) => setHidden((h) => (v === true ? h.filter((x) => x !== id) : [...h, id]))} />
                      Show
                    </label>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Move ${w.label} up`} disabled={!canEdit || i === 0} onClick={() => move(id, -1)}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Move ${w.label} down`} disabled={!canEdit || i === order.length - 1} onClick={() => move(id, 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">An athlete who rearranges their own dashboard keeps theirs.</p>
          <div className="space-y-1.5">
            <Label htmlFor="bx-note">Note pinned to the top of every athlete's dashboard</Label>
            <Textarea id="bx-note" value={coachNote} maxLength={600} rows={3} disabled={!canEdit} onChange={(e) => setCoachNote(e.target.value)} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">Announcement and celebration</h3>
          <div className="space-y-1.5">
            <Label htmlFor="bx-banner">Banner across the top of every screen</Label>
            <Input id="bx-banner" value={announcement} maxLength={200} disabled={!canEdit} placeholder="e.g. Lifting moves to 6am Thursday" onChange={(e) => setAnnouncement(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bx-until">Show until (optional)</Label>
            <Input id="bx-until" type="date" value={announcementUntil} disabled={!canEdit} onChange={(e) => setAnnouncementUntil(e.target.value)} className="max-w-48" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bx-cheer">Personal-best cheer</Label>
              <Input id="bx-cheer" value={cheer} maxLength={140} disabled={!canEdit} placeholder="e.g. Fly high, Falcons!" onChange={(e) => setCheer(e.target.value)} />
            </div>
            <ColorField
              label="Cheer color"
              value={cheerColor}
              allowEmpty
              emptyLabel="your main color"
              disabled={!canEdit}
              onChange={(hex) => setCheerColor(hex)}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">App icon</h3>
          <p className="text-sm text-muted-foreground">
            On iPhone, your athletes' Forge icon switches to this color the next time they open the app. iPhone asks
            them once to confirm. The icon's name stays Forge.
          </p>
          <div className="flex flex-wrap gap-2">
            {BRAND_APP_ICONS.map((icon) => (
              <button
                key={icon.id}
                type="button"
                disabled={!canEdit}
                onClick={() => setAppIcon(icon.id)}
                aria-pressed={appIcon === icon.id}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs ${appIcon === icon.id ? "border-primary" : "border-border"}`}
              >
                <span className="h-10 w-10 rounded-xl" style={{ background: icon.color }} />
                {icon.label}
              </button>
            ))}
          </div>
        </section>

        {canEdit && (
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save all"}
          </Button>
        )}
        <ImageCropDialog
          file={pendingImage?.file ?? null}
          kind={pendingImage?.kind ?? "wordmark"}
          programName={data?.brandTeamName ?? null}
          primaryColor={data?.brandPrimaryColor ?? null}
          saving={uploading}
          onCancel={() => setPendingImage(null)}
          onSave={(cropped) => pendingImage && void upload(pendingImage.kind, cropped)}
        />
      </CardContent>
    </Card>
  );
}
