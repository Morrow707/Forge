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
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, getJson, resolveApiUrl, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ImagePlus, Trash2, Palette, Pipette, AlertTriangle } from "lucide-react";
import { COACH_FEATURE_FIELDS, type CoachFeature } from "@shared/team-features";
import { contrastForegroundHsl, meetsWcagAA, nearestAccessibleColor } from "@/lib/color";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";
import { cn } from "@/lib/utils";

// Not yet in TypeScript's own DOM lib -- Chromium-family browsers ship the
// real API; everywhere else this whole capability is feature-detected via
// `"EyeDropper" in window` before ever touching this type, so an absent
// implementation never matters at runtime, only at the type level here.
declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
  }
}

const QUERY_KEY = ["/api/coach/branding"];

// Samples the uploaded logo's actual pixels for one-click "exact color"
// swatches (see nearestAccessibleColor's neighbor comment on why a coach
// picking off a color wheel can't promise an exact brand hex) -- downscales
// to a small canvas first since only the color mix matters, not per-pixel
// precision, then buckets by a coarse quantization so near-identical
// anti-aliased pixels collapse into one swatch instead of dozens. Filters
// out near-white/near-black/near-transparent, which are almost always
// background fill on a logo file, not a color anyone actually wants a
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

// Only the visible swatch's fallback -- shown in the <input type="color">
// itself when nothing's set yet, since that control always needs a valid
// hex value even with nothing chosen. What actually gets submitted on Save
// is the real state below, which stays "" (unbranded) until a coach
// actually touches a picker -- see the Save button's own comment.
const SWATCH_FALLBACK_PRIMARY = "#e2521a";
const SWATCH_FALLBACK_SECONDARY = "#0b0b0f";

type BrandingResponse = {
  teamName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  features: Record<CoachFeature, boolean>;
};

/** Lets a coach/program white-label their own corner of the app -- a team
 * name, logo, and two brand colors shown in the header and throughout their
 * own and their athletes' views (see AppShell), plus which optional nav
 * sections (Nutrition, Analytics, etc.) their program actually uses. Shared
 * across a whole coaching staff (see getPrimaryCoachId in storage.ts) --
 * a school's colors don't change depending on which assistant is logged in. */
export function TeamBrandingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<BrandingResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => getJson("/api/coach/branding"),
    enabled: open,
  });

  const [teamName, setTeamName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [logoSwatches, setLogoSwatches] = useState<string[]>([]);
  const eyedropperSupported = typeof window !== "undefined" && "EyeDropper" in window;

  useEffect(() => {
    if (!data) return;
    setTeamName(data.teamName ?? "");
    setPrimaryColor(data.primaryColor ?? "");
    setSecondaryColor(data.secondaryColor ?? "");
  }, [data]);

  // Re-extracts every time the logo itself changes (upload/replace/remove),
  // not on every render -- an <img> load event, not a dependency on
  // anything that changes per-keystroke.
  useEffect(() => {
    if (!data?.logoUrl) {
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
    img.src = resolveApiUrl(data.logoUrl);
    return () => {
      cancelled = true;
    };
  }, [data?.logoUrl]);

  async function pickWithEyedropper(onPicked: (hex: string) => void) {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      onPicked(result.sRGBHex);
    } catch {
      // Coach hit Escape or clicked away -- not an error worth a toast.
    }
  }

  const primaryForeground = primaryColor ? contrastForegroundHsl(primaryColor) : null;
  const primaryContrastOk =
    !primaryColor || meetsWcagAA(primaryColor, primaryForeground?.endsWith("100%") ? "#ffffff" : "#000000");
  const primaryAccessibleFix = !primaryContrastOk ? nearestAccessibleColor(primaryColor) : null;

  function invalidateBranding() {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    // AppShell (and any athlete under this coach) reads this one -- has to
    // refresh too or the header/nav won't pick up the change until reload.
    qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/coach/branding", { teamName, primaryColor, secondaryColor }),
    onSuccess: () => {
      invalidateBranding();
      toast.success("Branding updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save branding"),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("logo", file);
      return apiRequest("POST", "/api/coach/branding/logo", form);
    },
    onSuccess: () => {
      invalidateBranding();
      toast.success("Logo updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't upload that logo"),
  });

  const removeLogoMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/coach/branding/logo"),
    onSuccess: () => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-teal-400" />
            Team Branding &amp; Features
          </DialogTitle>
          <DialogDescription>
            Your logo, team name, and colors show in the header and throughout the app for you
            and your athletes -- a "Powered by Forge Performance" line always stays underneath.
            Turn off any nav sections your program doesn't use to keep the app simpler.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface">
                  {data?.logoUrl ? (
                    <img
                      src={resolveApiUrl(data.logoUrl)}
                      alt="Team logo"
                      className="h-full w-full object-contain"
                    />
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
                      if (file) uploadLogoMutation.mutate(file);
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
                    {uploadLogoMutation.isPending ? "Uploading…" : data?.logoUrl ? "Replace" : "Upload"}
                  </Button>
                  {data?.logoUrl && (
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Notre Dame Volleyball"
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Shows next to your logo in place of "Forge" -- leave blank to keep the default.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="primary-color">Primary color</Label>
                {/* Hex is the primary affordance -- a program with an actual
                    brand guide has an exact value to type, not a color to
                    eyeball on a wheel. The wheel and eyedropper are the
                    secondary, quick-pick paths. */}
                <div className="flex items-center gap-1.5">
                  <Input
                    id="primary-color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#RRGGBB"
                    className="font-mono text-xs"
                  />
                  <input
                    type="color"
                    aria-label="Pick primary color from a wheel"
                    value={primaryColor || SWATCH_FALLBACK_PRIMARY}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  />
                  {eyedropperSupported && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label="Sample primary color with the eyedropper"
                      onClick={() => pickWithEyedropper(setPrimaryColor)}
                    >
                      <Pipette className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {!primaryContrastOk && (
                  <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="flex-1">
                      This color is too close to its own button text to read clearly (fails WCAG
                      AA).
                      {primaryAccessibleFix && (
                        <button
                          type="button"
                          onClick={() => setPrimaryColor(primaryAccessibleFix)}
                          className="ml-1 font-semibold underline underline-offset-2"
                        >
                          Use a readable version
                        </button>
                      )}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secondary-color">Secondary color</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="secondary-color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    placeholder="#RRGGBB"
                    className="font-mono text-xs"
                  />
                  <input
                    type="color"
                    aria-label="Pick secondary color from a wheel"
                    value={secondaryColor || SWATCH_FALLBACK_SECONDARY}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  />
                  {eyedropperSupported && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label="Sample secondary color with the eyedropper"
                      onClick={() => pickWithEyedropper(setSecondaryColor)}
                    >
                      <Pipette className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {logoSwatches.length > 0 && (
                <div className="col-span-2 space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    Pulled straight from your logo's own pixels -- tap to set as your primary
                    color.
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
                          primaryColor.toLowerCase() === hex.toLowerCase() && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                        )}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Preview</Label>
              <p className="text-xs text-muted-foreground">
                Updates live as you type/pick, before you save -- this is exactly what shows in
                the app header for you and your athletes.
              </p>
              <div className="overflow-hidden rounded-md border border-border">
                <div
                  className="flex items-center gap-2 bg-surface px-3 py-2.5"
                  style={{ borderBottom: `3px solid ${secondaryColor || SWATCH_FALLBACK_SECONDARY}` }}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md">
                    {data?.logoUrl ? (
                      <img
                        src={resolveApiUrl(data.logoUrl)}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="font-display text-sm font-extrabold uppercase tracking-wider">
                      {teamName || "Forge"}
                    </span>
                    {(teamName || data?.logoUrl) && (
                      <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
                        {POWERED_BY_FORGE_LABEL}
                      </span>
                    )}
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

            <div className="space-y-2 border-t border-border pt-4">
              <Label>Nav sections</Label>
              <div className="space-y-2.5">
                {COACH_FEATURE_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className="flex cursor-pointer items-start gap-2.5 text-sm"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={data?.features[field.key] ?? true}
                      disabled={featureMutation.isPending}
                      onCheckedChange={(checked) =>
                        featureMutation.mutate({ [field.key]: checked === true })
                      }
                    />
                    <span>
                      <span className="font-medium">{field.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {field.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save Branding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
