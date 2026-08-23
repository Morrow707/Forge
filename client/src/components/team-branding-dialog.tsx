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
import { ImagePlus, Trash2, Palette } from "lucide-react";
import { COACH_FEATURE_FIELDS, type CoachFeature } from "@shared/team-features";
import { contrastForegroundHsl } from "@/lib/color";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";

const QUERY_KEY = ["/api/coach/branding"];

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

  useEffect(() => {
    if (!data) return;
    setTeamName(data.teamName ?? "");
    setPrimaryColor(data.primaryColor ?? "");
    setSecondaryColor(data.secondaryColor ?? "");
  }, [data]);

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
                <div className="flex items-center gap-2">
                  <input
                    id="primary-color"
                    type="color"
                    value={primaryColor || SWATCH_FALLBACK_PRIMARY}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#RRGGBB"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="secondary-color">Secondary color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="secondary-color"
                    type="color"
                    value={secondaryColor || SWATCH_FALLBACK_SECONDARY}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  />
                  <Input
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    placeholder="#RRGGBB"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
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
