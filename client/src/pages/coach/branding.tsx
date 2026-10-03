import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { ColorField } from "@/components/color-field";
import { BrandedMark } from "@/components/branded-mark";
import { ForgeMark } from "@/components/forge-mark";
import { ExercisePageThemeDialog } from "@/components/exercise-page-theme-dialog";
import { apiRequest, getJson, resolveApiUrl, ApiError } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { computeBrandingStyle, ensureBrandFontLoaded, type EffectiveBranding } from "@/lib/branding-style";
import { extractDominantColors, extractColorsFromFile } from "@/lib/image-colors";
import { contrastForegroundHsl, meetsWcagAA } from "@/lib/color";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";
import { BRAND_HEADING_FONTS, BRAND_BACKGROUND_STRENGTHS } from "@shared/branding-options";
import { COACH_FEATURE_FIELDS, type CoachFeature } from "@shared/team-features";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ImagePlus, Trash2, Copy, Mail, Palette, Lock } from "lucide-react";

/** THE BRANDING PAGE. Scott, 2026-10-03: the app should be fully customizable, in the order
 *  an athlete meets it: "login page first, landing page, emails, so on and so forth."
 *
 *  One page, six sections, each a live preview beside its controls and its own Save. The
 *  primary coach edits; a staff coach sees it read-only (the server refuses their PATCH). What
 *  is gated behind Full Personalization is drawn with a lock and left editable, because the
 *  save silently drops a gated field and the lock says why. */

const ORG_QUERY_KEY = ["/api/coach/branding"];
const BACKGROUND_HUE_PRESETS = [
  { label: "Ink", hue: 222 },
  { label: "Navy", hue: 215 },
  { label: "Forest", hue: 150 },
  { label: "Wine", hue: 350 },
  { label: "Plum", hue: 280 },
  { label: "Charcoal", hue: 0 },
];

type OrgBranding = EffectiveBranding & { features: Record<CoachFeature, boolean> };
type CoachEntitlements = { hasCustomColors?: boolean; hasTeamIdentity?: boolean; coachesCorner?: unknown };

export default function CoachBranding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = user?.role === "coach" && user.isPrimaryCoach === true;
  const {
    data: org,
    isLoading,
    isError,
    refetch,
  } = useQuery<OrgBranding>({ queryKey: ORG_QUERY_KEY, queryFn: () => getJson("/api/coach/branding") });
  const { data: entitlements } = useQuery<CoachEntitlements>({
    queryKey: ["/api/coach/entitlements"],
    queryFn: () => getJson("/api/coach/entitlements"),
  });
  const colorsUnlocked = entitlements?.hasCustomColors !== false;
  const identityUnlocked = entitlements?.hasTeamIdentity !== false;

  // Drafts, seeded once when the record lands.
  const [teamName, setTeamName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [backgroundHue, setBackgroundHue] = useState<number | null>(null);
  const [backgroundStrength, setBackgroundStrength] = useState<number>(1);
  const [headingFont, setHeadingFont] = useState<string>("forge");
  const [motto, setMotto] = useState("");
  const [mission, setMission] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [slug, setSlug] = useState("");
  const [senderName, setSenderName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [swatches, setSwatches] = useState<string[]>([]);
  const [palette, setPalette] = useState<string[]>([]);
  const [themeOpen, setThemeOpen] = useState(false);
  const seeded = useRef(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!org || seeded.current) return;
    setTeamName(org.brandTeamName ?? "");
    setPrimaryColor(org.brandPrimaryColor ?? "");
    setSecondaryColor(org.brandSecondaryColor ?? "");
    setBackgroundHue(org.brandBackgroundHue ?? null);
    setBackgroundStrength(org.brandBackgroundStrength ?? 1);
    setHeadingFont(org.brandHeadingFont ?? "forge");
    setMotto(org.brandMotto ?? "");
    setMission(org.brandMission ?? "");
    setContactEmail(org.brandContactEmail ?? "");
    setWelcomeMessage(org.brandWelcomeMessage ?? "");
    setSlug(org.brandSlug ?? "");
    setSenderName(org.brandSenderName ?? "");
    setLogoUrl(org.brandLogoUrl ?? null);
    seeded.current = true;
  }, [org]);

  // The saved palette lives on this coach's device: the colors they settled on, at the top
  // of every picker on this page.
  const paletteKey = user ? `forge:brand-palette:${user.id}` : null;
  useEffect(() => {
    if (!paletteKey) return;
    try {
      setPalette(JSON.parse(localStorage.getItem(paletteKey) ?? "[]"));
    } catch {
      setPalette([]);
    }
  }, [paletteKey]);
  function savePalette(next: string[]) {
    setPalette(next);
    if (paletteKey) {
      try {
        localStorage.setItem(paletteKey, JSON.stringify(next));
      } catch {
        // storage blocked: the palette simply does not persist
      }
    }
  }

  useEffect(() => {
    if (!logoUrl) {
      setSwatches([]);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setSwatches(extractDominantColors(img));
    };
    img.onerror = () => {
      if (!cancelled) setSwatches([]);
    };
    img.src = resolveApiUrl(logoUrl);
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);
  useEffect(() => ensureBrandFontLoaded(headingFont), [headingFont]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ORG_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
  }
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      await apiRequest("PATCH", "/api/coach/branding", body);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that"),
  });
  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("logo", file);
      const res = await apiRequest("POST", "/api/coach/branding/logo", form);
      return res.json() as Promise<{ logoUrl?: string; brandLogoUrl?: string }>;
    },
    onSuccess: (result) => {
      setLogoUrl(result.logoUrl ?? result.brandLogoUrl ?? null);
      invalidate();
      toast.success("Logo updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't upload that logo"),
  });
  const removeLogo = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/coach/branding/logo"),
    onSuccess: () => {
      setLogoUrl(null);
      invalidate();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove the logo"),
  });
  const features = useMutation({
    mutationFn: (patch: Partial<Record<CoachFeature, boolean>>) =>
      apiRequest("PUT", "/api/coach/features", patch),
    onSuccess: invalidate,
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that"),
  });
  const testEmail = useMutation({
    mutationFn: () => apiRequest("POST", "/api/coach/branding/test-email"),
    onSuccess: () => toast.success(`Sent to ${user?.email}`),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send the test"),
  });

  // The draft, as the app would draw it. Every preview on this page is the real component
  // wrapped in this style, so what the coach sees is what the athlete gets.
  const draft: EffectiveBranding = {
    brandTeamName: teamName || null,
    brandLogoUrl: logoUrl,
    brandPrimaryColor: primaryColor || null,
    brandSecondaryColor: secondaryColor || null,
    brandBackgroundHue: backgroundHue,
    brandBackgroundStrength: backgroundStrength,
    brandHeadingFont: headingFont,
    brandMotto: motto || null,
    brandMission: mission || null,
    brandContactEmail: contactEmail || null,
    brandWelcomeMessage: welcomeMessage || null,
    brandSlug: slug || null,
    brandSenderName: senderName || null,
  };
  const draftStyle = computeBrandingStyle(draft);
  const readable = (hex: string) =>
    !hex || meetsWcagAA(hex, contrastForegroundHsl(hex).endsWith("100%") ? "#ffffff" : "#000000");
  const primaryOk = readable(primaryColor);
  const secondaryOk = readable(secondaryColor);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const loginLink = `${origin}/login?team=${encodeURIComponent(slug || user?.coachCode || "")}`;
  const publicLink = `${origin}/team/${encodeURIComponent(slug || user?.coachCode || "")}`;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy, select it and copy by hand");
    }
  }

  function Swatches({ colors, onPick, label }: { colors: string[]; onPick: (hex: string) => void; label: string }) {
    if (colors.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="flex flex-wrap gap-1.5">
          {colors.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => onPick(hex)}
              className="h-7 w-7 rounded-full border-2 border-background shadow-[0_0_0_1px_hsl(var(--border))] transition-transform hover:scale-110"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </div>
    );
  }
  function Gate({ unlocked, children }: { unlocked: boolean; children: React.ReactNode }) {
    return (
      <div className={cn("space-y-3", !unlocked && "rounded-md border border-dashed border-amber-500/40 p-3")}>
        {!unlocked && (
          <p className="flex items-center gap-1.5 text-xs text-amber-500">
            <Lock className="h-3 w-3" /> Part of Full Personalization. Included for rosters above 20
            athletes; smaller programs add it from Billing. Saving leaves these fields as they are.
          </p>
        )}
        {children}
      </div>
    );
  }
  function Section({
    step,
    title,
    description,
    preview,
    children,
    onSave,
  }: {
    step: number;
    title: string;
    description: string;
    preview: React.ReactNode;
    children: React.ReactNode;
    onSave?: () => void;
  }) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs text-primary">{step}</span>
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="label-xs mb-2">Preview</p>
            <div className="overflow-hidden rounded-lg border border-border" style={draftStyle}>
              {preview}
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            {children}
            {onSave && canEdit && (
              <Button type="button" onClick={onSave} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <AppShell title="Branding">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Everything an athlete sees, in the order they see it. Each preview updates as you type.{" "}
        {POWERED_BY_FORGE_LABEL} stays as a small mark under the name and at the foot of every page; it is
        the one thing on this page that cannot be changed.
        {!canEdit && " Only the primary coach can edit these; you are viewing."}
      </p>

      {isError ? (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <ReadFailed what="your branding" onRetry={() => void refetch()} />
          </CardContent>
        </Card>
      ) : isLoading || !org ? (
        <div className="mt-6 h-40 animate-pulse rounded-md bg-surface" />
      ) : (
        <>
          {/* 1. LOGIN */}
          <Section
            step={1}
            title="Login screen"
            description="The first thing an athlete sees. Logo, program name and primary color are free at every size."
            preview={
              <div className="bg-background px-6 py-8">
                <BrandedMark brand={draft} tagline="Coach. Program. Perform." />
                <div className="mx-auto mt-6 max-w-xs space-y-2">
                  <div className="h-9 rounded-md border border-border bg-surface" />
                  <div className="h-9 rounded-md border border-border bg-surface" />
                  <div
                    className="flex h-9 items-center justify-center rounded-md text-sm font-semibold"
                    style={{
                      backgroundColor: primaryColor || "#e2521a",
                      color: `hsl(${contrastForegroundHsl(primaryColor || "#e2521a")})`,
                    }}
                  >
                    Sign in
                  </div>
                </div>
              </div>
            }
            onSave={() => save.mutate({ teamName: teamName.trim() || null, primaryColor: primaryColor || null })}
          >
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Program name</Label>
              <Input id="brand-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} maxLength={60} placeholder="e.g. Cal Strength & Conditioning" disabled={!canEdit} />
              <p className="text-xs text-muted-foreground">Replaces the word Forge inside the app. The app's name on the phone stays Forge.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
                  {logoUrl ? <img src={resolveApiUrl(logoUrl)} alt="Current logo" className="h-full w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
                </div>
                <div className="flex flex-col gap-1.5">
                  <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo.mutate(f); e.target.value = ""; }} />
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInput.current?.click()} disabled={!canEdit || uploadLogo.isPending}>
                    {uploadLogo.isPending ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
                  </Button>
                  {logoUrl && canEdit && (
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeLogo.mutate()} disabled={removeLogo.isPending}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">PNG with a transparent background works best. Also becomes the home-screen icon on the web.</p>
            </div>
            <ColorField label="Primary color" value={primaryColor} onChange={setPrimaryColor} />
            {!primaryOk && <p className="text-xs text-amber-500">Too light or dark to read as button text. The save will still go through, but pick a stronger shade.</p>}
            <Swatches colors={swatches} onPick={setPrimaryColor} label="From your logo, tap to use" />
            <Swatches colors={palette} onPick={setPrimaryColor} label="Your saved palette" />
            <div className="flex flex-wrap items-center gap-2">
              <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const colors = await extractColorsFromFile(f); if (colors.length === 0) { toast.error("Couldn't read colors from that image"); return; } savePalette([...new Set([...colors, ...palette])].slice(0, 12)); toast.success(`${colors.length} colors added to your palette`); }} />
              <Button type="button" variant="outline" size="sm" onClick={() => imageInput.current?.click()}>
                <Palette className="h-3.5 w-3.5" /> Pull colors from an image
              </Button>
              {primaryColor && !palette.includes(primaryColor.toLowerCase()) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => savePalette([primaryColor.toLowerCase(), ...palette].slice(0, 12))}>
                  Save {primaryColor} to palette
                </Button>
              )}
              {palette.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => savePalette([])}>Clear palette</Button>
              )}
            </div>
            <div className="space-y-1.5 rounded-md bg-surface p-3">
              <p className="text-xs font-semibold">Team login link</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{loginLink}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void copy(loginLink, "Login link")}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
              <p className="text-xs text-muted-foreground">Send this to athletes. Their phone remembers your look from then on.</p>
            </div>
          </Section>

          {/* 2. HOME */}
          <Section
            step={2}
            title="Home"
            description="The header, the background and the feel of every screen once they are in."
            preview={
              <div className="bg-background">
                <div className="flex items-center gap-2 bg-surface px-3 py-2.5" style={{ borderBottom: `3px solid ${secondaryColor || "#0b0b0f"}` }}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
                    {logoUrl ? <img src={resolveApiUrl(logoUrl)} alt="" className="h-full w-full object-contain" /> : <ForgeMark className="h-7 w-7 rounded-md" />}
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="font-display text-sm font-extrabold uppercase tracking-wider">{teamName || "Forge"}</span>
                    {(teamName || logoUrl) && <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">{POWERED_BY_FORGE_LABEL}</span>}
                  </div>
                </div>
                <div className="space-y-3 p-3">
                  <div className="flex gap-2">
                    <span className="rounded-md px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: primaryColor || "#e2521a", color: `hsl(${contrastForegroundHsl(primaryColor || "#e2521a")})` }}>Today</span>
                    <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">Calendar</span>
                    <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">Library</span>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="font-display text-lg font-extrabold uppercase">Upper Body Strength</p>
                    <p className="text-xs text-muted-foreground">4 exercises · 45 min</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Weekly streak</p>
                    <p className="font-display text-2xl font-extrabold text-primary">6 days</p>
                  </div>
                </div>
              </div>
            }
            onSave={() =>
              save.mutate({
                secondaryColor: secondaryColor || null,
                backgroundHue,
                backgroundStrength,
                headingFont,
              })
            }
          >
            <Gate unlocked={colorsUnlocked}>
              <ColorField label="Secondary color" value={secondaryColor} onChange={setSecondaryColor} />
              {!secondaryOk && <p className="text-xs text-amber-500">Hard to read against text. Pick a stronger shade.</p>}
              <Swatches colors={[...swatches, ...palette]} onPick={setSecondaryColor} label="Tap to use as the secondary" />
              <div className="space-y-1.5">
                <Label>Background tint</Label>
                <p className="text-xs text-muted-foreground">Shifts every surface toward a hue. Cal picks navy, a forest-green program picks forest.</p>
                <div className="flex flex-wrap gap-1.5">
                  {BACKGROUND_HUE_PRESETS.map((p) => (
                    <button key={p.label} type="button" disabled={!canEdit} onClick={() => setBackgroundHue(p.hue)} className={cn("rounded-md border px-2.5 py-1.5 text-xs font-medium", backgroundHue === p.hue ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>{p.label}</button>
                  ))}
                  <Input type="number" min={0} max={359} value={backgroundHue ?? ""} placeholder="hue" onChange={(e) => setBackgroundHue(e.target.value === "" ? null : Math.min(359, Math.max(0, Number(e.target.value) || 0)))} className="h-auto w-20 py-1.5 text-xs" aria-label="Exact hue, 0 to 359" disabled={!canEdit} />
                  {primaryColor && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { const hsl = computeBrandingStyle({ brandLogoUrl: null, brandPrimaryColor: primaryColor, brandSecondaryColor: null }) as Record<string, string> | undefined; const h = hsl?.["--primary"]?.split(" ")[0]; if (h) setBackgroundHue(Number(h)); }}>Match primary</Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tint strength</Label>
                <div className="flex gap-1.5">
                  {BRAND_BACKGROUND_STRENGTHS.map((s) => (
                    <button key={s} type="button" disabled={!canEdit} onClick={() => setBackgroundStrength(s)} className={cn("rounded-md border px-3 py-1.5 text-xs font-medium", backgroundStrength === s ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                      {s === 1 ? "Subtle" : s === 2 ? "Clear" : "Bold"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Heading font</Label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {BRAND_HEADING_FONTS.map((f) => (
                    <button key={f.id} type="button" disabled={!canEdit} onClick={() => setHeadingFont(f.id)} className={cn("rounded-md border px-2.5 py-2 text-left text-sm uppercase", headingFont === f.id ? "border-primary bg-primary/10" : "border-border")} style={{ fontFamily: f.stack }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </Gate>
            <div className="space-y-2 border-t border-border pt-4">
              <Label>Nav sections</Label>
              <p className="text-xs text-muted-foreground">Turn off what your program doesn't use. Tab names are renamed from the menu under your name.</p>
              {COACH_FEATURE_FIELDS.map((field) => (
                <label key={field.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={org.features?.[field.key] ?? true} disabled={!canEdit || features.isPending} onCheckedChange={(c) => features.mutate({ [field.key]: c === true })} />
                  <span><span className="font-medium">{field.label}</span><span className="block text-xs text-muted-foreground">{field.description}</span></span>
                </label>
              ))}
            </div>
          </Section>

          {/* 3. EMAILS */}
          <Section
            step={3}
            title="Emails"
            description="Every email an athlete or a parent on your program receives: welcome, guardian claim, password reset, new device."
            preview={
              <div className="bg-white text-[#111]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
                <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: primaryColor || "#F65B23" }}>
                  {logoUrl && <img src={resolveApiUrl(logoUrl)} alt="" className="h-8 w-8 rounded bg-white/90 object-contain p-0.5" />}
                  <span className="text-lg font-bold tracking-wide" style={{ color: `hsl(${contrastForegroundHsl(primaryColor || "#F65B23")})` }}>{(teamName || "FORGE").toUpperCase()}</span>
                </div>
                <div className="space-y-2 px-5 py-5 text-sm">
                  <p className="text-lg font-bold">Welcome, Jordan</p>
                  <p className="text-[#555]">Your account is ready to go.</p>
                  <p className="text-[#555]">You're connected with {teamName || "your coach"}. Whatever they assign will show up on your calendar automatically.</p>
                  <p className="pt-3 text-xs text-[#999]">Sent by {senderName || teamName || "Forge"}{teamName || senderName ? " via Forge" : ""}.</p>
                </div>
              </div>
            }
            onSave={() => save.mutate({ senderName: senderName.trim() || null })}
          >
            <Gate unlocked={identityUnlocked}>
              <div className="space-y-1.5">
                <Label htmlFor="brand-sender">Sender name</Label>
                <Input id="brand-sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} maxLength={40} placeholder={teamName || "Your program"} disabled={!canEdit} />
                <p className="text-xs text-muted-foreground">Shows as "{senderName || teamName || "Your program"} via Forge" in the inbox. The address stays Forge's, so mail keeps delivering.</p>
              </div>
            </Gate>
            <Button type="button" variant="outline" size="sm" onClick={() => testEmail.mutate()} disabled={testEmail.isPending}>
              <Mail className="h-3.5 w-3.5" /> {testEmail.isPending ? "Sending…" : "Send me a test"}
            </Button>
            <p className="text-xs text-muted-foreground">Uses what is saved, not what is typed. Save first.</p>
          </Section>

          {/* 4. ATHLETE SCREENS */}
          <Section
            step={4}
            title="Athlete screens"
            description="The welcome note on their dashboard and the colors of the screen they log every set on."
            preview={
              <div className="space-y-3 bg-background p-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="label-xs mb-1">From {teamName || "your coach"}</p>
                  <p className="text-sm">{welcomeMessage || "Welcome to the program. Check your calendar for today's session."}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="font-display text-base font-extrabold uppercase">Back Squat</p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Set 1</span>
                    <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">Set 2</span>
                  </div>
                </div>
              </div>
            }
            onSave={() => save.mutate({ welcomeMessage: welcomeMessage.trim() || null })}
          >
            <Gate unlocked={identityUnlocked}>
              <div className="space-y-1.5">
                <Label htmlFor="brand-welcome">Welcome message for athletes</Label>
                <Textarea id="brand-welcome" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} maxLength={300} rows={3} placeholder="A note in your own voice, shown on their dashboard" disabled={!canEdit} />
              </div>
            </Gate>
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label>Exercise screen colors</Label>
              <p className="text-xs text-muted-foreground">The backdrop, the Watch Demo button and the completed-set marker on the logging screen.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setThemeOpen(true)} disabled={!canEdit}>Edit exercise screen colors</Button>
            </div>
          </Section>

          {/* 5. PUBLIC PAGE */}
          <Section
            step={5}
            title="Public page"
            description="What anyone sees at your team address before they have an account."
            preview={
              <div className="bg-background p-4 text-center">
                <BrandedMark brand={draft} size="md" />
                {motto && <p className="mt-2 font-display text-lg uppercase tracking-wide">{motto}</p>}
                <p className="mt-2 text-sm text-muted-foreground">{mission || "About the program goes here."}</p>
                {contactEmail && <p className="mt-2 text-xs text-muted-foreground">{contactEmail}</p>}
                <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">{publicLink}</p>
              </div>
            }
            onSave={() =>
              save.mutate({
                slug: slug.trim() || null,
                motto: motto.trim() || null,
                mission: mission.trim() || null,
                contactEmail: contactEmail.trim() || null,
              })
            }
          >
            <Gate unlocked={identityUnlocked}>
              <div className="space-y-1.5">
                <Label htmlFor="brand-slug">Team address</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{origin}/team/</span>
                  <Input id="brand-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={30} placeholder="cal-strength" disabled={!canEdit} className="max-w-[12rem]" />
                </div>
                <p className="text-xs text-muted-foreground">Letters, numbers and hyphens. Your invite code keeps working too.</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => void copy(publicLink, "Team address")}><Copy className="h-3.5 w-3.5" /> Copy address</Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-motto">Motto</Label>
                <Input id="brand-motto" value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={80} placeholder="e.g. Earn it every day" disabled={!canEdit} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-mission">About the program</Label>
                <Textarea id="brand-mission" value={mission} onChange={(e) => setMission(e.target.value)} maxLength={500} rows={4} disabled={!canEdit} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-contact">Public contact email</Label>
                <Input id="brand-contact" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={255} disabled={!canEdit} />
              </div>
            </Gate>
          </Section>

          {/* 6. EVERYWHERE */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs text-primary">6</span>
                Everywhere else
              </CardTitle>
              <CardDescription>Follows the colors above with nothing to set.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Charts, toasts, the loading spinner, the glow behind buttons, and the screens an athlete sees while waiting on a parent all take the primary color.</p>
              <p>The native app icon, the app's name on the phone and the splash screen stay Forge. One app, one icon, Apple's rule. On the web, your logo is the home-screen icon.</p>
              <p className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide opacity-60">{POWERED_BY_FORGE_LABEL} <span className="font-normal normal-case tracking-normal">appears under your name and at the foot of every page.</span></p>
            </CardContent>
          </Card>
          <ExercisePageThemeDialog open={themeOpen} onOpenChange={setThemeOpen} />
        </>
      )}
    </AppShell>
  );
}
