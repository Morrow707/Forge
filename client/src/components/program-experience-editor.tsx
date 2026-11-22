import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, FileDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorField } from "@/components/color-field";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { shareOrDownloadFile } from "@/lib/share-file";
import { TROPHY_CATEGORY_LABEL } from "@shared/achievements";
import {
  CHECKIN_QUESTION_KINDS,
  MAX_CHECKIN_QUESTIONS,
  MAX_PROGRAM_TROPHIES,
  MAX_SEASONS,
  MAX_WELCOME_SCREENS,
  PROGRAM_TROPHY_CATEGORIES,
  PROGRAM_TROPHY_TIERS,
  type BrandExtras,
} from "@shared/brand-extras";
import { useT } from "@/i18n";

/**
 * THE PROGRAM'S OWN EXPERIENCE (Scott, 2026-11-19): its own check-in questions, its own trophies,
 * season and rivalry looks, a weekly recap email, welcome screens for a new athlete, and a
 * printable recruiting flyer. One Save; everything here is optional and starts off.
 */
type Question = NonNullable<BrandExtras["checkinQuestions"]>[number];
type Trophy = NonNullable<BrandExtras["trophies"]>[number];
type Season = NonNullable<BrandExtras["seasons"]>[number];
type Recap = NonNullable<BrandExtras["recap"]>;
type Welcome = NonNullable<BrandExtras["welcomeScreens"]>[number];

const KIND_LABEL: Record<Question["kind"], string> = { scale: "1 to 5", yesno: "Yes or no", text: "Short answer" };
/** Keys only: each day is drawn in the reader's language from a known Sunday (2023-01-01). */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_RECAP: Recap = {
  enabled: false,
  weekday: 0,
  includeTotals: true,
  includeTopPerformers: false,
  note: null,
  sendToGuardians: false,
};
const ID_LENGTH = 8;
const RADIX = 36;
/** Skips the "0." a base-36 Math.random() string starts with. */
const AFTER_DECIMAL = 2;
const DEFAULT_THRESHOLD = 10;
const SELECT = "h-10 rounded-md border border-input bg-background px-2 text-sm";

/** A short id for a new item; the server only needs it to stay the same once saved. */
const newId = () => Math.random().toString(RADIX).slice(AFTER_DECIMAL, AFTER_DECIMAL + ID_LENGTH);

export function ProgramExperienceEditor({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery<{ brandExtras?: BrandExtras | null }>({
    queryKey: ["/api/coach/branding"],
    queryFn: () => getJson("/api/coach/branding"),
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [recap, setRecap] = useState<Recap>(DEFAULT_RECAP);
  const [welcome, setWelcome] = useState<Welcome[]>([]);
  const [downloading, setDownloading] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    const saved = data.brandExtras ?? null;
    setQuestions(saved?.checkinQuestions ?? []);
    setTrophies(saved?.trophies ?? []);
    setSeasons(saved?.seasons ?? []);
    setRecap(saved?.recap ?? DEFAULT_RECAP);
    setWelcome(saved?.welcomeScreens ?? []);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const body: BrandExtras = {
        checkinQuestions: questions.filter((q) => q.text.trim()).length ? questions.filter((q) => q.text.trim()) : null,
        trophies: trophies.filter((t) => t.label.trim()).length ? trophies.filter((t) => t.label.trim()) : null,
        seasons: seasons.filter((s) => s.name.trim() && s.start && s.end).length
          ? seasons.filter((s) => s.name.trim() && s.start && s.end).map((s) => ({ ...s, banner: s.banner?.trim() || null }))
          : null,
        recap: { ...recap, note: recap.note?.trim() || null },
        welcomeScreens: welcome.filter((w) => w.title.trim()).length ? welcome.filter((w) => w.title.trim()) : null,
      };
      const res = await apiRequest("PATCH", "/api/coach/branding/extras", body);
      return (await res.json()) as { skipped: string[] };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/branding"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      toast[result.skipped.length ? "info" : "success"](
        result.skipped.length ? "Saved. Some options need Full Personalization, so they were left as they were." : "Saved",
      );
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't save")),
  });

  async function downloadFlyer() {
    setDownloading(true);
    try {
      await shareOrDownloadFile("/api/coach/flyer.pdf", "recruiting-flyer.pdf", "Recruiting flyer");
    } catch {
      toast.error(t("Couldn't make the flyer"));
    } finally {
      setDownloading(false);
    }
  }

  const edit = <T,>(set: (fn: (prev: T[]) => T[]) => void, i: number, patch: Partial<T>) =>
    set((prev) => prev.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  const drop = <T,>(set: (fn: (prev: T[]) => T[]) => void, i: number) => set((prev) => prev.filter((_, j) => j !== i));

  return (
    <Card className="mt-6" data-testid="program-experience-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs text-primary">7</span>
          {t("Your program's experience")}
        </CardTitle>
        <CardDescription>
          {t("Part of Full Personalization. Everything here is optional and starts off; use only what you want.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <section className="space-y-3">
          <h3 className="font-semibold">{t("Your check-in questions")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("Asked under Forge's five on the daily check-in. Every one is optional for the athlete, the answers show on each athlete's wellness history, and they never change the readiness score.")}
          </p>
          {questions.map((q, i) => (
            <div key={q.id} className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label>{t("Question {number}", { number: i + 1 })}</Label>
                <Input value={q.text} maxLength={120} disabled={!canEdit} placeholder={t("e.g. Did you eat breakfast?")} onChange={(e) => edit(setQuestions, i, { text: e.target.value })} />
              </div>
              <select className={SELECT} value={q.kind} disabled={!canEdit} aria-label={t("Answer type")} onChange={(e) => edit(setQuestions, i, { kind: e.target.value as Question["kind"] })}>
                {CHECKIN_QUESTION_KINDS.map((k) => (
                  <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="icon" disabled={!canEdit} aria-label={t("Remove question")} onClick={() => drop(setQuestions, i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {canEdit && questions.length < MAX_CHECKIN_QUESTIONS && (
            <Button type="button" variant="outline" size="sm" onClick={() => setQuestions((p) => [...p, { id: newId(), text: "", kind: "scale" }])}>
              <Plus className="mr-1 h-4 w-4" /> {t("Add a question")}
            </Button>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">{t("Your trophies")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("Shown in each athlete's trophy case beside Forge's, and earned the same way Forge's are counted.")}
          </p>
          {trophies.map((trophy, i) => (
            <div key={trophy.id} className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1 space-y-1.5">
                <Label>{t("Name")}</Label>
                <Input value={trophy.label} maxLength={48} disabled={!canEdit} placeholder={t("e.g. Iron Falcon")} onChange={(e) => edit(setTrophies, i, { label: e.target.value })} />
              </div>
              <select className={SELECT} value={trophy.category} disabled={!canEdit} aria-label={t("Earned for")} onChange={(e) => edit(setTrophies, i, { category: e.target.value as Trophy["category"] })}>
                {PROGRAM_TROPHY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(TROPHY_CATEGORY_LABEL[c])}</option>
                ))}
              </select>
              <div className="w-24 space-y-1.5">
                <Label>{t("Reach")}</Label>
                <Input type="number" min={1} value={trophy.threshold} disabled={!canEdit} onChange={(e) => edit(setTrophies, i, { threshold: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
              </div>
              <select className={SELECT} value={trophy.tier} disabled={!canEdit} aria-label={t("Tier")} onChange={(e) => edit(setTrophies, i, { tier: e.target.value as Trophy["tier"] })}>
                {PROGRAM_TROPHY_TIERS.map((tier) => (
                  <option key={tier} value={tier}>{tier}</option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="icon" disabled={!canEdit} aria-label={t("Remove trophy")} onClick={() => drop(setTrophies, i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {canEdit && trophies.length < MAX_PROGRAM_TROPHIES && (
            <Button type="button" variant="outline" size="sm" onClick={() => setTrophies((p) => [...p, { id: newId(), label: "", category: "workout_count", threshold: DEFAULT_THRESHOLD, tier: "bronze" }])}>
              <Plus className="mr-1 h-4 w-4" /> {t("Add a trophy")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t("A trophy an athlete has earned stays in their case even if you remove it here.")}</p>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">{t("Seasons and rivalry weeks")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("Between the two dates your app wears these colors and shows the banner. Outside them, your usual look comes back.")}
          </p>
          {seasons.map((s, i) => (
            <div key={s.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1 space-y-1.5">
                  <Label>{t("Name")}</Label>
                  <Input value={s.name} maxLength={48} disabled={!canEdit} placeholder={t("e.g. Rivalry week")} onChange={(e) => edit(setSeasons, i, { name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("From")}</Label>
                  <Input type="date" value={s.start} disabled={!canEdit} onChange={(e) => edit(setSeasons, i, { start: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("To")}</Label>
                  <Input type="date" value={s.end} disabled={!canEdit} onChange={(e) => edit(setSeasons, i, { end: e.target.value })} />
                </div>
                <Button type="button" variant="ghost" size="icon" disabled={!canEdit} aria-label={t("Remove season")} onClick={() => drop(setSeasons, i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorField
                  label={t("Main color")}
                  value={s.primaryColor ?? ""}
                  allowEmpty
                  emptyLabel="your usual main color"
                  disabled={!canEdit}
                  onChange={(hex) => edit(setSeasons, i, { primaryColor: hex || null })}
                />
                <ColorField
                  label={t("Second color")}
                  value={s.secondaryColor ?? ""}
                  allowEmpty
                  emptyLabel="your usual second color"
                  disabled={!canEdit}
                  onChange={(hex) => edit(setSeasons, i, { secondaryColor: hex || null })}
                />
              </div>
              <Input value={s.banner ?? ""} maxLength={200} disabled={!canEdit} placeholder={t("Banner (optional), e.g. Beat Central!")} onChange={(e) => edit(setSeasons, i, { banner: e.target.value })} />
            </div>
          ))}
          {canEdit && seasons.length < MAX_SEASONS && (
            <Button type="button" variant="outline" size="sm" onClick={() => setSeasons((p) => [...p, { id: newId(), name: "", start: "", end: "", primaryColor: null, secondaryColor: null, banner: null }])}>
              <Plus className="mr-1 h-4 w-4" /> {t("Add a season")}
            </Button>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">{t("Weekly recap email")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("One email a week to your athletes in your colors. Pick what goes in it; anything you leave unticked is left out.")}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recap.enabled} disabled={!canEdit} onCheckedChange={(v) => setRecap({ ...recap, enabled: v === true })} />
            {t("Send a weekly recap")}
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{t("Send it on")}</span>
            <select className={SELECT} value={recap.weekday} disabled={!canEdit || !recap.enabled} aria-label={t("Day")} onChange={(e) => setRecap({ ...recap, weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>{t.date(new Date(2023, 0, 1 + i), { weekday: "long" })}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recap.includeTotals} disabled={!canEdit || !recap.enabled} onCheckedChange={(v) => setRecap({ ...recap, includeTotals: v === true })} />
            {t("The team's week: workouts completed and personal records")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recap.includeTopPerformers} disabled={!canEdit || !recap.enabled} onCheckedChange={(v) => setRecap({ ...recap, includeTopPerformers: v === true })} />
            {t("Top performers (most workouts completed, first name and last initial)")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recap.sendToGuardians} disabled={!canEdit || !recap.enabled} onCheckedChange={(v) => setRecap({ ...recap, sendToGuardians: v === true })} />
            {t("Also send it to athletes' parents")}
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="px-recap-note">{t("Your note (optional)")}</Label>
            <Textarea id="px-recap-note" rows={3} maxLength={600} value={recap.note ?? ""} disabled={!canEdit || !recap.enabled} onChange={(e) => setRecap({ ...recap, note: e.target.value })} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">{t("Welcome screens")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("Up to three screens a new athlete sees once, the first time they open the app on your program.")}
          </p>
          {welcome.map((w, i) => (
            <div key={i} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>{t("Screen {number} title", { number: i + 1 })}</Label>
                  <Input value={w.title} maxLength={140} disabled={!canEdit} placeholder={t("e.g. Welcome to Falcons Strength")} onChange={(e) => edit(setWelcome, i, { title: e.target.value })} />
                </div>
                <Button type="button" variant="ghost" size="icon" disabled={!canEdit} aria-label={t("Remove screen")} onClick={() => drop(setWelcome, i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea rows={3} maxLength={400} value={w.body} disabled={!canEdit} placeholder={t("What you want them to know first")} onChange={(e) => edit(setWelcome, i, { body: e.target.value })} />
            </div>
          ))}
          {canEdit && welcome.length < MAX_WELCOME_SCREENS && (
            <Button type="button" variant="outline" size="sm" onClick={() => setWelcome((p) => [...p, { title: "", body: "" }])}>
              <Plus className="mr-1 h-4 w-4" /> {t("Add a screen")}
            </Button>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">{t("Recruiting flyer")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("A printable page in your colors with your logo, name and motto, and a QR code that opens sign-up with your join code already filled in.")}
          </p>
          <Button type="button" variant="outline" disabled={downloading} onClick={() => void downloadFlyer()}>
            <FileDown className="mr-1 h-4 w-4" /> {downloading ? t("Making it…") : t("Download the flyer")}
          </Button>
        </section>

        {canEdit && (
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? t("Saving…") : t("Save all")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
