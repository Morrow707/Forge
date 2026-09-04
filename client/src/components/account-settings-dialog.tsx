import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/components/color-field";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Ticket, AlertTriangle, Moon, Sun } from "lucide-react";
import { contrastForegroundHsl, meetsWcagAA, nearestAccessibleColor } from "@/lib/color";
import { cn } from "@/lib/utils";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";
import type { PublicUser } from "@shared/schema";

// Same five hues shown in the "Coach Themes" concept deck -- named presets
// for the common case, with an exact-number field right next to them for
// anyone who wants a precise value. Ink (222) matches the app's own
// default neutral hue, so picking it is equivalent to clearing the override.
const BACKGROUND_HUE_PRESETS = [
  { label: "Ink", hue: 222 },
  { label: "Slate", hue: 210 },
  { label: "Forest", hue: 150 },
  { label: "Wine", hue: 350 },
  { label: "Plum", hue: 280 },
];

/** Account-level self-service: name and login email -- neither had any
 * in-app edit path before, and a coach in particular had no way to fix
 * their own name short of asking someone to edit the database. Available
 * to every role. Password change lives in its own standalone dialog
 * (see ChangePasswordDialog, opened from the "Password" nav item) rather
 * than here -- the two used to duplicate each other. Personal accent color
 * (coach-only, any staff member) rides along here too since it's the same
 * "about me, not the org" category as the rest of this dialog. */
export function AccountSettingsDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PublicUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();

  // Per-device, applies immediately -- no Save step, same "no batching"
  // treatment NotificationSettingsDialog already uses for biometric
  // lock/health sync (a plain look, not account data worth a server
  // round-trip). Read fresh each time this dialog opens so it can't drift
  // from whatever another tab/device just set.
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  useEffect(() => {
    if (open) setThemeState(getStoredTheme());
  }, [open]);
  function handleSetTheme(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  const [name, setName] = useState(user.name);
  const nameMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/account/profile", { name: name.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success("Name updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update name"),
  });

  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const emailMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/account/email", { password: emailPassword, newEmail });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success("Email updated");
      setEmailPassword("");
      setNewEmail("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update email"),
  });

  const [accentColor, setAccentColor] = useState(user.personalAccentColor ?? "");
  const [secondaryColor, setSecondaryColor] = useState(user.personalSecondaryColor ?? "");
  const [backgroundHue, setBackgroundHue] = useState(user.personalBackgroundHue ?? 222);

  // One endpoint for all three personal-theme fields -- each still gets its
  // own Save/Clear below (matching this dialog's existing per-field pattern
  // for Name/Email/Password), just sending only the one key that changed so
  // the other two are left untouched server-side.
  const themeMutation = useMutation({
    mutationFn: async (next: {
      accentColor?: string | null;
      secondaryColor?: string | null;
      backgroundHue?: number | null;
    }) => {
      await apiRequest("PATCH", "/api/coach/personal-theme", next);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success("Personal theme updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update your theme"),
  });
  const accentContrastOk =
    !accentColor ||
    meetsWcagAA(accentColor, contrastForegroundHsl(accentColor).endsWith("100%") ? "#ffffff" : "#000000");
  const secondaryContrastOk =
    !secondaryColor ||
    meetsWcagAA(secondaryColor, contrastForegroundHsl(secondaryColor).endsWith("100%") ? "#ffffff" : "#000000");

  const PHILOSOPHY_MAX = 200;
  const [philosophy, setPhilosophy] = useState(user.coachingPhilosophy ?? "");
  const philosophyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/coach/philosophy", {
        coachingPhilosophy: philosophy.trim() || null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success("Coaching philosophy updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update your philosophy"),
  });

  const [redeemCode, setRedeemCode] = useState("");
  const redeemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/redeem-code", { code: redeemCode.trim() });
      return (await res.json()) as { trialExpiresAt: string };
    },
    onSuccess: (data) => {
      const until = new Date(data.trialExpiresAt).toLocaleDateString();
      toast.success(`Code redeemed -- full access unlocked through ${until}`);
      setRedeemCode("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't redeem that code"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>Your name and login email.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Name</Label>
            <div className="flex items-center gap-2">
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              <Button
                type="button"
                variant="outline"
                onClick={() => nameMutation.mutate()}
                disabled={!name.trim() || name.trim() === user.name || nameMutation.isPending}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>Email</Label>
            <p className="text-xs text-muted-foreground">Currently {user.email}</p>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
            />
            <PasswordInput
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Current password, to confirm"
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => emailMutation.mutate()}
              disabled={!newEmail.trim() || !emailPassword || emailMutation.isPending}
            >
              Update email
            </Button>
          </div>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>Appearance</Label>
            <p className="text-xs text-muted-foreground">
              Dark is the default. This is just a look for this device -- it switches immediately,
              nothing to save.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-pressed={theme === "dark"}
                onClick={() => handleSetTheme("dark")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  theme === "dark"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Moon className="h-4 w-4" />
                Dark
              </button>
              <button
                type="button"
                aria-pressed={theme === "light"}
                onClick={() => handleSetTheme("light")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  theme === "light"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Sun className="h-4 w-4" />
                Light
              </button>
            </div>
          </div>

          {user.role === "coach" && (
            <div className="space-y-5 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label>Personal theme</Label>
                <p className="text-xs text-muted-foreground">
                  Yours alone -- everything below is layered on top of whatever your program's own
                  branding already sets, only in your own view, and never touches what your athletes
                  or other coaches see. Type an exact hex/number if you know it, or use the pickers.
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Accent -- buttons, focus rings, card outlines, "today" highlights, PR/stat numbers,
                  and the ambient glow under every card.
                </p>
                <ColorField label="Accent" value={accentColor || "#F65B23"} onChange={setAccentColor} />
                {!accentContrastOk && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="space-y-1.5">
                      <p>This color is too light/dark to read clearly as button text.</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAccentColor(nearestAccessibleColor(accentColor) ?? accentColor)}
                      >
                        Use a readable version of this color
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => themeMutation.mutate({ accentColor: accentColor || null })}
                    disabled={themeMutation.isPending}
                  >
                    Save accent
                  </Button>
                  {user.personalAccentColor && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setAccentColor("");
                        themeMutation.mutate({ accentColor: null });
                      }}
                      disabled={themeMutation.isPending}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Secondary -- your own second color, independent of your accent (mirrors your
                  program's own primary + secondary pair).
                </p>
                <ColorField label="Secondary" value={secondaryColor || "#4C6B8A"} onChange={setSecondaryColor} />
                {!secondaryContrastOk && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="space-y-1.5">
                      <p>This color is too light/dark to read clearly as text.</p>
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
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => themeMutation.mutate({ secondaryColor: secondaryColor || null })}
                    disabled={themeMutation.isPending}
                  >
                    Save secondary
                  </Button>
                  {user.personalSecondaryColor && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setSecondaryColor("");
                        themeMutation.mutate({ secondaryColor: null });
                      }}
                      disabled={themeMutation.isPending}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  Background tint -- shifts the whole app's neutral surfaces (background, cards,
                  borders) toward a hue of your choice, keeping the exact same contrast already tuned
                  for legibility.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BACKGROUND_HUE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setBackgroundHue(preset.hue)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        backgroundHue === preset.hue
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <Input
                    type="number"
                    min={0}
                    max={359}
                    value={backgroundHue}
                    onChange={(e) => setBackgroundHue(Math.min(359, Math.max(0, Number(e.target.value) || 0)))}
                    className="h-auto w-20 py-1.5 text-xs"
                    aria-label="Exact background hue, 0-359"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => themeMutation.mutate({ backgroundHue })}
                    disabled={themeMutation.isPending}
                  >
                    Save background tint
                  </Button>
                  {user.personalBackgroundHue != null && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setBackgroundHue(222);
                        themeMutation.mutate({ backgroundHue: null });
                      }}
                      disabled={themeMutation.isPending}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {user.role === "coach" && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label htmlFor="coaching-philosophy">Coaching philosophy</Label>
              <p className="text-xs text-muted-foreground">
                A short line about your approach or a personal quote -- shown under your own name
                on your team's public About page, alongside anyone else on staff who sets one.
              </p>
              <Textarea
                id="coaching-philosophy"
                value={philosophy}
                onChange={(e) => setPhilosophy(e.target.value.slice(0, PHILOSOPHY_MAX))}
                placeholder="e.g. Compete like it's the last rep, every rep."
                maxLength={PHILOSOPHY_MAX}
                className="min-h-16"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {philosophy.length}/{PHILOSOPHY_MAX}
                </span>
                <div className="flex gap-2">
                  {user.coachingPhilosophy && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPhilosophy("");
                        philosophyMutation.mutate();
                      }}
                      disabled={philosophyMutation.isPending}
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => philosophyMutation.mutate()}
                    disabled={
                      philosophy.trim() === (user.coachingPhilosophy ?? "").trim() ||
                      philosophyMutation.isPending
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {user.role === "coach" && user.isPrimaryCoach && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label className="flex items-center gap-1.5">
                <Ticket className="h-4 w-4" />
                Redeem a code
              </Label>
              <p className="text-xs text-muted-foreground">
                Have a promo code for free trial access? Enter it here.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => redeemMutation.mutate()}
                  disabled={!redeemCode.trim() || redeemMutation.isPending}
                >
                  Redeem
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
