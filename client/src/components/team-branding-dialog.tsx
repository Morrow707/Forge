import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Pipette, Upload, X, AlertTriangle } from "lucide-react";
import { meetsWcagAA, nearestAccessibleColor, contrastForegroundHsl } from "@/lib/color";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";

// Not yet in TypeScript's DOM lib -- Chrome/Edge only, feature-detected
// at every call site below rather than assumed present.
declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
  }
}

type Branding = {
  brandTeamName?: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
};

export type BrandingScope =
  | { type: "org" }
  | { type: "team"; teamId: number; teamName: string; initial: Branding };

function endpointFor(scope: BrandingScope) {
  return scope.type === "org"
    ? { get: "/api/coach/branding", patch: "/api/coach/branding", logo: "/api/coach/branding/logo" }
    : {
        get: null,
        patch: `/api/coach/teams/${scope.teamId}/branding`,
        logo: `/api/coach/teams/${scope.teamId}/branding/logo`,
      };
}

/** Extracts a handful of dominant colors from an uploaded logo file by
 * drawing it to an offscreen canvas and bucketing sampled pixels into
 * coarse RGB buckets -- not real k-means, just frequency-sorted buckets,
 * which is plenty for "here are a few real colors pulled from your own
 * logo" one-click swatches. */
function extractDominantColors(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve([]);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue; // skip transparent pixels
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Skip near-white/near-black -- almost always the logo's
          // transparent-background fill, not a color a coach wants as a
          // brand swatch.
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max > 245 && min > 235) continue;
          if (max < 20) continue;
          const bucketKey = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
          const existing = buckets.get(bucketKey);
          if (existing) {
            existing.count++;
            existing.r += r;
            existing.g += g;
            existing.b += b;
          } else {
            buckets.set(bucketKey, { count: 1, r, g, b });
          }
        }
        const top = Array.from(buckets.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 6)
          .map(({ count, r, g, b }) => {
            const hex = (n: number) => Math.round(n / count).toString(16).padStart(2, "0");
            return `#${hex(r)}${hex(g)}${hex(b)}`;
          });
        resolve(top);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const hasEyedropper = typeof window !== "undefined" && !!window.EyeDropper;

  function commit(next: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
  }

  async function pickWithEyedropper() {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      setDraft(result.sRGBHex);
      commit(result.sRGBHex);
    } catch {
      // User cancelled the pick -- not an error.
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          placeholder="#003262"
          className="font-mono uppercase"
          maxLength={7}
        />
        <input
          type="color"
          aria-label={`${label} picker`}
          value={/^#[0-9a-fA-F]{6}$/.test(draft) ? draft : "#000000"}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        {hasEyedropper && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Sample ${label} from screen`}
            onClick={pickWithEyedropper}
          >
            <Pipette className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** White-label branding editor: exact hex colors (not just a generic color
 * wheel), a native eyedropper where supported, one-click swatches pulled
 * from the coach's own uploaded logo, and a live WCAG contrast check
 * before a color that would be unreadable as button/header text can be
 * saved. Handles both org-wide branding (reused across the whole staff)
 * and a single team's override of just the color/logo fields. */
export function TeamBrandingDialog({
  open,
  onOpenChange,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: BrandingScope;
}) {
  const qc = useQueryClient();
  const endpoints = endpointFor(scope);
  const isTeamScope = scope.type === "team";
  const teamId = isTeamScope ? scope.teamId : null;

  const { data: orgBranding } = useQuery<Branding>({
    queryKey: [endpoints.get],
    queryFn: () => getJson(endpoints.get!),
    enabled: open && scope.type === "org",
  });
  const branding = isTeamScope ? scope.initial : orgBranding;

  const [teamName, setTeamName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#F65B23");
  const [secondaryColor, setSecondaryColor] = useState("#1A1D23");
  const [swatches, setSwatches] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only re-seed the editable fields once per dialog-open, keyed on the
  // scope identity (not the branding object reference, which is a fresh
  // object on every parent render/refetch and would otherwise stomp
  // whatever the coach has typed so far every time a background refetch
  // lands).
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
    setPrimaryColor(branding?.brandPrimaryColor || "#F65B23");
    setSecondaryColor(branding?.brandSecondaryColor || "#1A1D23");
    setSwatches([]);
    seededRef.current = seedKey;
  }, [open, seedKey, branding]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body =
        scope.type === "org"
          ? { teamName: teamName.trim() || null, primaryColor, secondaryColor }
          : { primaryColor, secondaryColor };
      await apiRequest("PATCH", endpoints.patch, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoints.get] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      toast.success("Branding saved");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save branding"),
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      await apiRequest("POST", endpoints.logo, formData);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoints.get] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      toast.success("Logo updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't upload logo"),
  });

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", endpoints.logo);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoints.get] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
    },
  });

  // Clears everything this dialog can set -- name/colors via the same
  // PATCH the null-able schema already accepts, plus the logo file, so
  // "reset" is one action instead of a coach having to null out each
  // field by hand and separately remember to hit Remove on the logo.
  const resetMutation = useMutation({
    mutationFn: async () => {
      const body = scope.type === "org" ? { teamName: null, primaryColor: null, secondaryColor: null } : { primaryColor: null, secondaryColor: null };
      await apiRequest("PATCH", endpoints.patch, body);
      if (branding?.brandLogoUrl) {
        await apiRequest("DELETE", endpoints.logo);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [endpoints.get] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      toast.success(isTeamScope ? "Team override removed -- back to inheriting the org's branding" : "Branding reset to Forge defaults");
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
    setSwatches(await extractDominantColors(file));
  }

  const primaryContrastOk = meetsWcagAA(primaryColor, contrastForegroundHsl(primaryColor));
  const secondaryContrastOk = meetsWcagAA(secondaryColor, contrastForegroundHsl(secondaryColor));
  const hasAnyBranding = !!(
    branding?.brandTeamName ||
    branding?.brandLogoUrl ||
    branding?.brandPrimaryColor ||
    branding?.brandSecondaryColor
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isTeamScope ? `Brand ${scope.teamName}` : "Branding"}</DialogTitle>
          <DialogDescription>
            {isTeamScope
              ? "Overrides your org's colors and logo for this team only -- leave a field blank to keep inheriting the org's own branding."
              : `Re-skin Forge with your own name, logo, and exact colors -- applies across your whole coaching staff and everyone on your roster. The ${POWERED_BY_FORGE_LABEL} mark stays as a small watermark either way.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-elevated">
                {branding?.brandLogoUrl ? (
                  <img
                    src={branding.brandLogoUrl}
                    alt="Current logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground" />
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
                  Upload logo
                </Button>
                {branding?.brandLogoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => removeLogoMutation.mutate()}
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {swatches.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-muted-foreground">Colors pulled from your logo:</p>
                <div className="flex flex-wrap gap-1.5">
                  {swatches.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      title={hex}
                      onClick={() => setPrimaryColor(hex)}
                      className="h-6 w-6 rounded-full border border-border ring-offset-2 ring-offset-background hover:ring-2 hover:ring-primary"
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
                  onClick={() => setPrimaryColor(nearestAccessibleColor(primaryColor))}
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
                  onClick={() => setSecondaryColor(nearestAccessibleColor(secondaryColor))}
                >
                  Use a readable version of this color
                </Button>
              </div>
            </div>
          )}

          <div
            className="flex items-center gap-2 rounded-md border border-border p-3"
            style={{ backgroundColor: secondaryColor }}
          >
            <span
              className="rounded px-2.5 py-1 text-sm font-bold"
              style={{ backgroundColor: primaryColor, color: contrastForegroundHsl(primaryColor) }}
            >
              {(isTeamScope ? scope.teamName : teamName) || "Preview"}
            </span>
            <span className="text-xs" style={{ color: contrastForegroundHsl(secondaryColor) }}>
              Live preview
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              Save branding
            </Button>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
