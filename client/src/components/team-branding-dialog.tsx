import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, getJson, resolveApiUrl, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ImagePlus, Trash2, Palette, AlertTriangle } from "lucide-react";
import { COACH_FEATURE_FIELDS, type CoachFeature } from "@shared/team-features";
import { contrastForegroundHsl, meetsWcagAA, nearestAccessibleColor } from "@/lib/color";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";
import { ColorField } from "@/components/color-field";
import { cn } from "@/lib/utils";

const ORG_QUERY_KEY = ["/api/coach/branding"];

// Samples the uploaded logo's actual pixels for one-click "exact color"
// swatches -- downscales to a small canvas first since only the color mix
// matters, not per-pixel precision, then buckets by a coarse quantization
// so near-identical anti-aliased pixels collapse into one swatch instead of
// dozens. Filters out near-white/near-black/near-transparent, which are
// almost always background fill on a logo file, not a color anyone wants a
// one-click swatch for.
function extractDominantColors(img: HTMLImageElement, max = 5): string[] {
  const canvas = document.createElement("canvas");
  const size = 48;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return []; // tainted canvas (shouldn't happen for a same-origin upload, but never crash the dialog over it)
  }
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const QUANT = 24; // bucket width -- collapses anti-aliasing noise into one swatch per real color
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue; // mostly-transparent pixel
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    if (maxc > 240 && minc > 225) continue; // near-white
    if (maxc < 20) continue; // near-black
    const key = `${Math.round(r / QUANT)}-${Math.round(g / QUANT)}-${Math.round(b / QUANT)}`;
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map(({ count, r, g, b }) => {
      const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n / count)));
      return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    });
}

// Only the visible swatch's fallback -- shown in the header-preview mockup
// below when nothing's set yet, since the preview always needs a value to
// render even before a coach has picked anything. What actually gets
// submitted on Save is the real state below, which stays "" (unbranded)
// until a coach actually touches a field.
const SWATCH_FALLBACK_PRIMARY = "#e2521a";
const SWATCH_FALLBACK_SECONDARY = "#0b0b0f";

type Branding = {
  brandTeamName?: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  // Org-scope-only fields -- never present on a team's `initial` override,
  // since a team never gets its own motto/mission/contact/welcome text,
  // only colors and a logo (see updateTeamBrandingSchema).
  brandMotto?: string | null;
  brandMission?: string | null;
  brandContactEmail?: string | null;
  brandWelcomeMessage?: string | null;
};

type OrgBrandingResponse = Branding & {
  features: Record<CoachFeature, boolean>;
};

export type BrandingScope =
  | { type: "org" }
  | { type: "team"; teamId: number; teamName: string; initial: Branding };

function endpointFor(scope: BrandingScope) {
  return scope.type === "org"
    ? { patch: "/api/coach/branding", logo: "/api/coach/branding/logo" }
    : {
        patch: `/api/coach/teams/${scope.teamId}/branding`,
        logo: `/api/coach/teams/${scope.teamId}/branding/logo`,
      };
}

/** White-label branding editor: exact hex colors (not just a generic color
 * wheel), a native eyedropper where supported (see ColorField), one-click
 * swatches pulled from the coach's own uploaded logo, a live WCAG contrast
 * check before a color that would be unreadable as button/header text can
 * be saved, a live preview of exactly what the app header will look like,
 * and which optional nav sections (Nutrition, Analytics, etc.) their
 * program actually uses. Handles both org-wide branding (reused across the
 * whole staff) and a single team's override of just the color/logo fields
 * (see BrandingScope's own comment). */
export function TeamBrandingDialog({
  open,
  onOpenChange,
  scope = { type: "org" },
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope?: BrandingScope;
}) {
  const qc = useQueryClient();
  const endpoints = endpointFor(scope);
  const isTeamScope = scope.type === "team";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetched even in team scope -- not for team scope's own fields (those
  // come from its `initial` prop below), but because the header's actual
  // displayed team NAME always comes from the org's own branding (a team
  // override only ever touches logo/colors, never the name -- see
  // getEffectiveBrandingForUser) and the live preview below needs the real
  // value to stay honest about what will actually show.
  const { data: orgData, isLoading: orgLoading } = useQuery<OrgBrandingResponse>({
    queryKey: ORG_QUERY_KEY,
    queryFn: () => getJson("/api/coach/branding"),
    enabled: open,
  });
  const isLoading = isTeamScope ? false : orgLoading;
  const branding: Branding | undefined = isTeamScope ? scope.initial : orgData;

  const [teamName, setTeamName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [motto, setMotto] = useState("");
  const [mission, setMission] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  // Tracked locally (not derived from orgData) so team scope -- which has no
  // GET to refetch from -- can update it directly from a mutation's own
  // response, the same way org scope's query invalidation effectively does.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSwatches, setLogoSwatches] = useState<string[]>([]);

  // Only re-seed the editable fields once per dialog-open, keyed on the
  // scope identity (not the branding object reference, which is a fresh
  // object on every parent render/refetch and would otherwise stomp
  // whatever the coach has typed so far every time a background refetch
  // lands).
  const teamId = isTeamScope ? scope.teamId : null;
  const seededRef = useRef<string | null>(null);
  const seedKey = `${scope.type}-${teamId ?? "org"}`;
  useEffect(() => {
    if (!open) {
      seededRef.current = null;
      return;
    }
    if (seededRef.current === seedKey && branding !== undefined) return;
    if (branding === undefined) return; // org scope still loading
    setTeamName(branding?.brandTeamName ?? "");
    setPrimaryColor(branding?.brandPrimaryColor ?? "");
    setSecondaryColor(branding?.brandSecondaryColor ?? "");
    setMotto(branding?.brandMotto ?? "");
    setMission(branding?.brandMission ?? "");
    setContactEmail(branding?.brandContactEmail ?? "");
    setWelcomeMessage(branding?.brandWelcomeMessage ?? "");
    setLogoUrl(branding?.brandLogoUrl ?? null);
    setLogoSwatches([]);
    seededRef.current = seedKey;
  }, [open, seedKey, branding]);

  // Re-extracts every time the logo itself changes (upload/replace/remove),
  // not on every render -- an <img> load event, not a dependency on
  // anything that changes per-keystroke.
  useEffect(() => {
    if (!logoUrl) {
      setLogoSwatches([]);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLogoSwatches(extractDominantColors(img));
    };
    img.onerror = () => {
      if (!cancelled) setLogoSwatches([]);
    };
    img.src = resolveApiUrl(logoUrl);
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  function invalidateBranding() {
    qc.invalidateQueries({ queryKey: ORG_QUERY_KEY });
    if (isTeamScope) qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
    // AppShell (and any athlete under this coach/team) reads this one --
    // has to refresh too or the header/nav won't pick up the change until
    // reload.
    qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body =
        scope.type === "org"
          ? {
              teamName: teamName.trim() || null,
              primaryColor: primaryColor || null,
              secondaryColor: secondaryColor || null,
              motto: motto.trim() || null,
              mission: mission.trim() || null,
              contactEmail: contactEmail.trim() || null,
              welcomeMessage: welcomeMessage.trim() || null,
            }
          : { primaryColor: primaryColor || null, secondaryColor: secondaryColor || null };
      await apiRequest("PATCH", endpoints.patch, body);
    },
    onSuccess: () => {
      invalidateBranding();
      toast.success("Branding saved");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save branding"),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("logo", file);
      const res = await apiRequest("POST", endpoints.logo, form);
      return res.json() as Promise<{ logoUrl?: string; brandLogoUrl?: string }>;
    },
    onSuccess: (result) => {
      setLogoUrl(result.logoUrl ?? result.brandLogoUrl ?? null);
      invalidateBranding();
      toast.success("Logo updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't upload that logo"),
  });

  const removeLogoMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", endpoints.logo),
    onSuccess: () => {
      setLogoUrl(null);
      invalidateBranding();
      toast.success("Logo removed");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove that logo"),
  });

  const featureMutation = useMutation({
    mutationFn: (patch: Partial<Record<CoachFeature, boolean>>) =>
      apiRequest("PUT", "/api/coach/features", patch),
    onSuccess: invalidateBranding,
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update that"),
  });

  // Clears everything this dialog can set -- name/colors/motto/etc via the
  // same PATCH the null-able schema already accepts, plus the logo file, so
  // "reset" is one action instead of a coach having to null out each field
  // by hand and separately remember to hit Remove on the logo.
  const resetMutation = useMutation({
    mutationFn: async () => {
      const body =
        scope.type === "org"
          ? {
              teamName: null,
              primaryColor: null,
              secondaryColor: null,
              motto: null,
              mission: null,
              contactEmail: null,
              welcomeMessage: null,
            }
          : { primaryColor: null, secondaryColor: null };
      await apiRequest("PATCH", endpoints.patch, body);
      if (logoUrl) await apiRequest("DELETE", endpoints.logo);
    },
    onSuccess: () => {
      setLogoUrl(null);
      invalidateBranding();
      toast.success(
        isTeamScope ? "Team override removed -- back to inheriting the org's branding" : "Branding reset to Forge defaults",
      );
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't reset branding"),
  });

  async function handleFile(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Use a PNG, JPEG, or WebP image");
      return;
    }
    uploadLogoMutation.mutate(file);
  }

  // contrastForegroundHsl returns an "H S% L%" triplet (for the CSS custom
  // property use below), not a hex color -- meetsWcagAA needs a real hex, so
  // this converts its black-or-white pick back into one via the only two
  // values it ever returns ("0 0% 4%" or "0 0% 100%").
  const primaryContrastOk =
    !primaryColor ||
    meetsWcagAA(primaryColor, contrastForegroundHsl(primaryColor).endsWith("100%") ? "#ffffff" : "#000000");
  const secondaryContrastOk =
    !secondaryColor ||
    meetsWcagAA(secondaryColor, contrastForegroundHsl(secondaryColor).endsWith("100%") ? "#ffffff" : "#000000");
  const hasAnyBranding = !!(
    branding?.brandTeamName ||
    branding?.brandLogoUrl ||
    branding?.brandPrimaryColor ||
    branding?.brandSecondaryColor ||
    branding?.brandMotto ||
    branding?.brandMission ||
    branding?.brandContactEmail ||
    branding?.brandWelcomeMessage
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-teal-400" />
            {isTeamScope ? `${scope.teamName} Branding` : "Branding & Features"}
          </DialogTitle>
          <DialogDescription>
            {isTeamScope
              ? "Overrides your org's colors and logo for this team only -- leave a field blank to keep inheriting the org's own branding."
              : `Re-skin Forge with your own name, logo, exact colors, and team-page copy -- applies across your whole coaching staff and everyone on your roster. The ${POWERED_BY_FORGE_LABEL} mark stays as a small watermark either way. Turn off any nav sections your program doesn't use to keep the app simpler.`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-6">
            {!isTeamScope && (
              <div className="space-y-1.5">
                <Label htmlFor="brand-team-name">Program name</Label>
                <Input
                  id="brand-team-name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Cal Strength & Conditioning"
                  maxLength={60}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
                  {logoUrl ? (
                    <img src={resolveApiUrl(logoUrl)} alt="Current logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadLogoMutation.isPending}
                  >
                    {uploadLogoMutation.isPending ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeLogoMutation.mutate()}
                      disabled={removeLogoMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              {logoSwatches.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[11px] text-muted-foreground">
                    Pulled straight from your logo's own pixels -- tap to set as your primary color.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {logoSwatches.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        title={hex}
                        onClick={() => setPrimaryColor(hex)}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 border-background shadow-[0_0_0_1px_hsl(var(--border))] transition-transform hover:scale-110",
                          primaryColor.toLowerCase() === hex.toLowerCase() &&
                            "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ColorField label="Primary color" value={primaryColor} onChange={setPrimaryColor} />
              <ColorField label="Secondary color" value={secondaryColor} onChange={setSecondaryColor} />
            </div>

            {!primaryContrastOk && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="space-y-1.5">
                  <p>This primary color is too light/dark to read clearly as button text.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPrimaryColor(nearestAccessibleColor(primaryColor) ?? primaryColor)}
                  >
                    Use a readable version of this color
                  </Button>
                </div>
              </div>
            )}

            {!secondaryContrastOk && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="space-y-1.5">
                  <p>This secondary color is too light/dark to read clearly as text.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSecondaryColor(nearestAccessibleColor(secondaryColor) ?? secondaryColor)}
                  >
                    Use a readable version of this color
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Preview</Label>
              <p className="text-xs text-muted-foreground">
                Updates live as you type/pick, before you save -- this is exactly what shows in the app header for you
                and your athletes.
              </p>
              <div className="overflow-hidden rounded-md border border-border">
                <div
                  className="flex items-center gap-2 bg-surface px-3 py-2.5"
                  style={{ borderBottom: `3px solid ${secondaryColor || SWATCH_FALLBACK_SECONDARY}` }}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
                    {logoUrl ? (
                      <img src={resolveApiUrl(logoUrl)} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="font-display text-sm font-extrabold uppercase tracking-wider">
                      {(isTeamScope ? scope.teamName : teamName) || "Forge"}
                    </span>
                    <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
                      {POWERED_BY_FORGE_LABEL}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-background px-3 py-2.5">
                  <span
                    className="rounded-md px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: primaryColor || SWATCH_FALLBACK_PRIMARY,
                      color: `hsl(${contrastForegroundHsl(primaryColor || SWATCH_FALLBACK_PRIMARY)})`,
                    }}
                  >
                    Active tab
                  </span>
                  <span className="text-xs text-muted-foreground">Your accent color</span>
                </div>
              </div>
            </div>

            {!isTeamScope && (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="brand-motto">Motto / tagline</Label>
                  <Input
                    id="brand-motto"
                    value={motto}
                    onChange={(e) => setMotto(e.target.value)}
                    placeholder="e.g. Earn it every day"
                    maxLength={80}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brand-mission">About the team</Label>
                  <Textarea
                    id="brand-mission"
                    value={mission}
                    onChange={(e) => setMission(e.target.value)}
                    placeholder="Shown on your team's About page -- who you are, what the program's about"
                    maxLength={500}
                    className="min-h-20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brand-contact-email">Public contact email (optional)</Label>
                  <Input
                    id="brand-contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="Shown on the About page -- never your real login email unless you enter it here"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brand-welcome">Welcome message for athletes</Label>
                  <Textarea
                    id="brand-welcome"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    placeholder="Shown on your athletes' own dashboard -- a note in your own voice"
                    maxLength={300}
                    className="min-h-16"
                  />
                </div>
              </div>
            )}

            {!isTeamScope && (
              <div className="space-y-2 border-t border-border pt-4">
                <Label>Nav sections</Label>
                <div className="space-y-2.5">
                  {COACH_FEATURE_FIELDS.map((field) => (
                    <label key={field.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={orgData?.features[field.key] ?? true}
                        disabled={featureMutation.isPending}
                        onCheckedChange={(checked) => featureMutation.mutate({ [field.key]: checked === true })}
                      />
                      <span>
                        <span className="font-medium">{field.label}</span>
                        <span className="block text-xs text-muted-foreground">{field.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {hasAnyBranding && (
            <Button
              type="button"
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              {isTeamScope ? "Remove override" : "Reset to defaults"}
            </Button>
          )}
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save Branding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
