import { Link } from "wouter";
import { useEffect, useState } from "react";
import { DownloadButton } from "@/components/download-button";
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
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorField } from "@/components/color-field";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { ANSWER_REGISTERS, ANSWER_LENGTHS } from "@shared/answer-style";
import { toast } from "sonner";
import { Ticket, AlertTriangle, Moon, Sun } from "lucide-react";
import { contrastForegroundHsl, meetsWcagAA, nearestAccessibleColor } from "@/lib/color";
import { cn } from "@/lib/utils";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";
import { forgeCodeEntryIsAllowed } from "@/lib/forge-code-entry";
import { derivePrivacyTier } from "@shared/privacy-tiers";
import { PersonalEquipmentCard, ProgramEquipmentCard } from "@/components/equipment-profile-card";
import type { PublicUser } from "@shared/schema";
import { msg, useT } from "@/i18n";
import { LanguageSetting } from "@/components/language-setting";

// Same five hues shown in the "Coach Themes" concept deck -- named presets
// for the common case, with an exact-number field right next to them for
// anyone who wants a precise value. Ink (222) matches the app's own
// default neutral hue, so picking it is equivalent to clearing the override.
const BACKGROUND_HUE_PRESETS = [
  { label: msg("Ink"), hue: 222 },
  { label: msg("Slate"), hue: 210 },
  { label: msg("Forest"), hue: 150 },
  { label: msg("Wine"), hue: 350 },
  { label: msg("Plum"), hue: 280 },
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
  const t = useT();
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

  // THE ADULT'S OWN CAMERA SWITCH. The Video and Biometric Consent (section 7) says an adult
  // withdraws "by turning camera tracking off in their account", and until 2026-10-24 no such
  // control existed -- only a coach or a guardian could toggle it. Adults only: a minor's switch
  // is on the guardian dashboard. Turning it back on is agreeing to the consent again, which the
  // workout screen asks for the next time Record is tapped, so there is one way to give it.
  const isAdultAthlete =
    user.role === "athlete" && !!user.dateOfBirth && derivePrivacyTier(user.dateOfBirth) === "tier3_adult_18plus";
  const [confirmTrackingOff, setConfirmTrackingOff] = useState(false);
  const trackingOffMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/athlete/tracking-opt-out", { trackingOptOut: true });
    },
    onSuccess: () => {
      setConfirmTrackingOff(false);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/camera-access"] });
      toast.success(t("Camera tracking is off and your consent is withdrawn"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't turn camera tracking off")),
  });

  // An athlete may wear Forge's standard look instead of their program's (2026-11-20).
  const standardLookMutation = useMutation({
    mutationFn: async (on: boolean) => {
      await apiRequest("POST", "/api/athlete/standard-look", { on });
      return on;
    },
    onSuccess: (on) => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/branding/me"] });
      toast.success(on ? t("Using Forge's standard look") : t("Using your program's look"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't change your look")),
  });

  const [name, setName] = useState(user.name);
  const nameMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/account/profile", { name: name.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success(t("Name updated"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't update name")),
  });

  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const emailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/account/email", { password: emailPassword, newEmail });
      return (await res.json()) as { email: string; confirmationSent?: boolean };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success(
        data.confirmationSent
          ? t("Email updated. We sent a confirmation link to {email}. If it isn't there in a few minutes, check junk or spam.", { email: data.email })
          : t("Email updated"),
      );
      setEmailPassword("");
      setNewEmail("");
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't update email")),
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
      toast.success(t("Personal theme updated"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't update your theme")),
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
      toast.success(t("Coaching philosophy updated"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't update your philosophy")),
  });

  const [redeemCode, setRedeemCode] = useState("");
  const redeemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/redeem-code", { code: redeemCode.trim() });
      return (await res.json()) as { trialExpiresAt: string | null; message?: string };
    },
    onSuccess: (data) => {
      const until = data.trialExpiresAt ? new Date(data.trialExpiresAt).toLocaleDateString() : null;
      // Redeeming writes trialExpiresAt onto the user row, and every
      // entitlement gate in the app reads that off the CACHED /api/auth/me.
      // Without this the toast said "full access unlocked" while the app
      // went on behaving exactly as locked until the next reload -- the
      // most confusing possible outcome for a coach who just paid or was
      // comped.
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      // The server's sentence says what the code did: a trial through a date, or a discount on
      // the card plan (shared/promo-codes.ts). The date form is kept for an older server.
      toast.success(data.message ?? (until ? t("Code redeemed, full access unlocked through {date}", { date: until }) : t("Code redeemed")));
      setRedeemCode("");
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't redeem that code")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Account Settings")}</DialogTitle>
          <DialogDescription>{t("Your name and login email.")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">{t("Name")}</Label>
            <div className="flex items-center gap-2">
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              <Button
                type="button"
                variant="outline"
                onClick={() => nameMutation.mutate()}
                disabled={!name.trim() || name.trim() === user.name || nameMutation.isPending}
              >
                {t("Save")}
              </Button>
            </div>
          </div>

          <LanguageSetting user={user} />

          {isAdultAthlete && (
            <div className="space-y-1.5 border-t border-border pt-4" data-testid="camera-tracking-switch">
              <Label>{t("Camera tracking")}</Label>
              {user.trackingOptOut ? (
                <p className="text-xs text-muted-foreground">
                  {t("Off. Nothing is measured from your video and your Video and Biometric Consent is withdrawn. To turn it back on, tap Record on a workout and agree to the consent again.")}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("On. Turning it off stops every camera measurement from now on and withdraws your Video and Biometric Consent. Video already saved stays in your video bank until you delete it.")}
                  </p>
                  {confirmTrackingOff ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => trackingOffMutation.mutate()}
                        disabled={trackingOffMutation.isPending}
                      >
                        {trackingOffMutation.isPending ? t("Turning off…") : t("Yes, turn it off")}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmTrackingOff(false)}>
                        {t("Keep it on")}
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmTrackingOff(true)}>
                      {t("Turn camera tracking off")}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>{t("Email")}</Label>
            <p className="text-xs text-muted-foreground">{t("Currently {email}", { email: user.email })}</p>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t("New email address")}
            />
            <PasswordInput
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder={t("Current password, to confirm")}
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => emailMutation.mutate()}
              disabled={!newEmail.trim() || !emailPassword || emailMutation.isPending}
            >
              {t("Update email")}
            </Button>
          </div>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>{t("Appearance")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Dark is the default. This is just a look for this device, it switches immediately, nothing to save.")}
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
                {t("Dark")}
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
                {t("Light")}
              </button>
            </div>
          </div>

          {user.role === "athlete" && (
            <div className="space-y-1.5 border-t border-border pt-4" data-testid="standard-look-switch">
              <Label htmlFor="standard-look">{t("Program colors")}</Label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  id="standard-look"
                  checked={user.useStandardLook === true}
                  disabled={standardLookMutation.isPending}
                  onCheckedChange={(c) => standardLookMutation.mutate(c === true)}
                />
                <span>{t("Use Forge's standard look")}</span>
              </label>
              <p className="text-xs text-muted-foreground">
                {t("Shows the app in Forge's colors, fonts and icon instead of your program's. Your program's name, logo, notes and announcements still show. Saved to your account, so it follows you to every device.")}
              </p>
            </div>
          )}

          <AnswerStyleSection />

          {/* THE WEIGHT ROOM (2026-11-21): a coach's program rooms, and everybody's own. */}
          {user.role === "coach" && (
            <div className="border-t border-border pt-4">
              <ProgramEquipmentCard />
            </div>
          )}
          {user.role !== "guardian" && (
            <div className="border-t border-border pt-4">
              <PersonalEquipmentCard title={user.role === "coach" ? t("My own training equipment") : t("My equipment")} />
            </div>
          )}

          {user.role === "athlete" && <MyResearchConsentSection />}

          {user.role === "coach" && (
            <div className="space-y-5 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label>{t("Personal theme")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("Yours alone, everything below is layered on top of whatever your program's own branding already sets, only in your own view, and never touches what your athletes or other coaches see. Type an exact hex/number if you know it, or use the pickers.")}
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {t("Accent, buttons, focus rings, card outlines, \"today\" highlights, PR/stat numbers, and the ambient glow under every card.")}
                </p>
                <ColorField label={t("Accent")} value={accentColor || "#F65B23"} onChange={setAccentColor} />
                {!accentContrastOk && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="space-y-1.5">
                      <p>{t("This color is too light/dark to read clearly as button text.")}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setAccentColor(nearestAccessibleColor(accentColor) ?? accentColor)}
                      >
                        {t("Use a readable version of this color")}
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
                    {t("Save accent")}
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
                      {t("Clear")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {t("Secondary, your own second color, independent of your accent (mirrors your program's own primary + secondary pair).")}
                </p>
                <ColorField label={t("Secondary")} value={secondaryColor || "#4C6B8A"} onChange={setSecondaryColor} />
                {!secondaryContrastOk && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="space-y-1.5">
                      <p>{t("This color is too light/dark to read clearly as text.")}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSecondaryColor(nearestAccessibleColor(secondaryColor) ?? secondaryColor)}
                      >
                        {t("Use a readable version of this color")}
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
                    {t("Save secondary")}
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
                      {t("Clear")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {t("Background tint, shifts the whole app's neutral surfaces (background, cards, borders) toward a hue of your choice, keeping the exact same contrast already tuned for legibility.")}
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
                      {t(preset.label)}
                    </button>
                  ))}
                  <Input
                    type="number"
                    min={0}
                    max={359}
                    value={backgroundHue}
                    onChange={(e) => setBackgroundHue(Math.min(359, Math.max(0, Number(e.target.value) || 0)))}
                    className="h-auto w-20 py-1.5 text-xs"
                    aria-label={t("Exact background hue, 0-359")}
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
                    {t("Save background tint")}
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
                      {t("Clear")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {user.role === "coach" && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label htmlFor="coaching-philosophy">{t("Coaching philosophy")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("A short line about your approach or a personal quote, shown under your own name on your team's public About page, alongside anyone else on staff who sets one.")}
              </p>
              <Textarea
                id="coaching-philosophy"
                value={philosophy}
                onChange={(e) => setPhilosophy(e.target.value.slice(0, PHILOSOPHY_MAX))}
                placeholder={t("e.g. Compete like it's the last rep, every rep.")}
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
                      {t("Clear")}
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
                    {t("Save")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* WEB ONLY (lib/forge-code-entry.ts): App Review rejected 1.0 on 2026-11-06 under
              3.1.1 for a code that unlocks paid features outside In-App Purchase. A coach's plan
              is sold on the web anyway, so this box loses nothing on the phone. */}
          {user.role === "coach" && user.isPrimaryCoach && forgeCodeEntryIsAllowed() && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label className="flex items-center gap-1.5">
                <Ticket className="h-4 w-4" />
                {t("Redeem a code")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("Have a promo code for free trial access? Enter it here.")}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  placeholder={t("CODE")}
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => redeemMutation.mutate()}
                  disabled={!redeemCode.trim() || redeemMutation.isPending}
                >
                  {t("Redeem")}
                </Button>
              </div>
            </div>
          )}

          {/* THE PRIVACY POLICY AND THE EULA, REACHABLE FROM SETTINGS IN THE APP (App Review,
              2026-10-29, Guideline 3.1.2: the reviewer could find neither inside the app). Every
              role renders this dialog, the guardian dashboard included, so this is the one row
              that reaches all four. The routes render the reviewed text from the API. */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground" data-testid="account-legal-links">
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">{t("Privacy Policy")}</Link>
            <Link href="/eula" className="underline underline-offset-2 hover:text-foreground">{t("Terms of Use (EULA)")}</Link>
            <Link href="/legal" className="underline underline-offset-2 hover:text-foreground">{t("All legal documents")}</Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * How the assistants should write to you.
 *
 * Lives in account settings rather than beside any one assistant, because it
 * applies to all of them and a control that appears next to the nutrition
 * chat reads as being about the nutrition chat. Shipped server-side with no
 * way to set it, which made the whole feature invisible.
 *
 * Both axes default to Standard, and Standard sends no instruction at all --
 * a reader who never touches this gets exactly what they got before.
 */
function AnswerStyleSection() {
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery<{ answerRegister: string | null; answerLength: string | null }>({
    queryKey: ["/api/answer-style"],
    queryFn: () => getJson("/api/answer-style"),
  });

  const save = useMutation({
    mutationFn: (next: { register: string | null; length: string | null }) =>
      apiRequest("PUT", "/api/answer-style", next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/answer-style"] });
      toast.success(t("The assistants will write to you this way from now on."));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't save that")),
  });

  const register = data?.answerRegister ?? "standard";
  const length = data?.answerLength ?? "standard";

  const Row = ({
    label,
    options,
    value,
    onPick,
  }: {
    label: string;
    options: readonly { key: string; label: string; preview: string }[];
    value: string;
    onPick: (key: string) => void;
  }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onPick(o.key)}
            disabled={save.isPending}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              value === o.key
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      {/* WHAT THE CHOICE ACTUALLY SOUNDS LIKE. Scott, 2026-09-23: "what does it mean when it
          talks more technically or writes more thoroughly?" -- a fair question about three
          buttons whose labels describe prose nobody has seen. The three previews on an axis
          answer the SAME question, so tapping between them shows the difference rather than a
          different topic. Live in shared/answer-style.ts beside the instruction each one
          describes, so a preview cannot drift from what the model is really told. */}
      <p className="text-xs italic leading-relaxed text-muted-foreground">
        {t(options.find((o) => o.key === value)?.preview ?? "")}
      </p>
    </div>
  );

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="space-y-1.5">
        <Label>{t("How the AI writes to you")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("Applies everywhere an assistant writes to you. It changes the wording only, never what you are told, and never a safety caveat.")}
        </p>
      </div>
      <Row
        label={t("Language")}
        options={ANSWER_REGISTERS}
        value={register}
        onPick={(key) => save.mutate({ register: key, length })}
      />
      <Row
        label={t("Length")}
        options={ANSWER_LENGTHS}
        value={length}
        onPick={(key) => save.mutate({ register, length: key })}
      />
    </div>
  );
}

/** THE ATHLETE'S OWN SAY OVER WHETHER THEIR DATA LEAVES FORGE.
 *
 * The server has had PUT /api/athlete/research-consent since research consent shipped, and
 * nothing in the app ever called it: the only consent control anywhere lived on the COACH's
 * roster screen. So an adult athlete could not opt in, could not opt out, and could not change
 * their mind without asking their coach to do it for them -- which is a strange shape for a
 * decision that is theirs alone.
 *
 * A minor's answer is not made here and the server refuses it outright; the guardian decides and
 * a coach records who they heard it from. This says so rather than showing a control that would
 * fail.
 */
function MyResearchConsentSection() {
  const t = useT();
  const qc = useQueryClient();
  const [showText, setShowText] = useState(false);

  const { data: status } = useQuery<{
    granted: boolean;
    requiresGuardian: boolean;
    grantedAt: string | null;
    staleTerms: boolean;
  }>({ queryKey: ["/api/athlete/research-consent"] });

  const { data: consentText } = useQuery<{ text: string }>({
    queryKey: ["/api/research-consent/text"],
    enabled: showText,
  });

  const { data: pendingRequest } = useQuery<{ requestedGranted: boolean } | null>({
    queryKey: ["/api/athlete/research-consent/request"],
  });

  const requestChange = useMutation({
    mutationFn: async (granted: boolean) => {
      await apiRequest("POST", "/api/athlete/research-consent/request", { granted });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/research-consent/request"] });
      toast.success(t("Sent to your guardian"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't send that request")),
  });

  const mutation = useMutation({
    mutationFn: async (granted: boolean) => {
      await apiRequest("PUT", "/api/athlete/research-consent", { granted });
    },
    onSuccess: (_d, granted) => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/research-consent"] });
      toast.success(
        granted
          ? t("You're opted in to research data collection")
          : t("You're opted out, nothing prepared from now on will include you"),
      );
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't change that")),
  });

  if (!status) return null;

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="space-y-1.5">
        <Label>{t("Research data")}</Label>
        <p className="text-xs text-muted-foreground">
          {t("Separate from your training data, which your coach always sees. This is only about whether your numbers can be included, without your name, in anything Forge prepares for an outside party. You can change it whenever you like, and changing it to off leaves you out of everything prepared from that point on.")}
        </p>
      </div>

      {/* THE TERMS CHANGED AFTER THEY SAID YES.
          Shown above the controls, not as a toast or a blocking dialog. A consent
          somebody is interrupted into giving is worth less than one they chose to give,
          and there is nothing urgent here: until they answer, the narrower agreement
          they actually made is the one that applies. So it waits where they already
          come to change this, and says exactly what is different. */}
      {status.staleTerms && (
        <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/5 px-3 py-2.5">
          <p className="text-sm font-semibold">{t("What you agreed to has changed")}</p>
          <p className="text-xs text-muted-foreground">
            {t("When you said yes, the only limit we named was that a report already sent can't be recalled. We've added one: if you delete your account, the group numbers stay, age, sport, position and the training numbers, with nothing in them that points back to you. Your account, your videos and anything that identifies you still go.")}
          </p>
          <p className="text-xs text-muted-foreground">
            {status.requiresGuardian
              ? t("Until a parent or guardian answers, the version you agreed to is the one that applies, and deleting your account would still remove you from everything.")
              : t("Until you answer, the version you agreed to is the one that applies, and deleting your account would still remove you from everything.")}
          </p>
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
          >
            {showText ? t("Hide the new wording") : t("Read the new wording")}
          </button>
          {!status.requiresGuardian && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
                {t("I still agree")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(false)}
              >
                {t("Withdraw instead")}
              </Button>
            </div>
          )}
        </div>
      )}

      {status.requiresGuardian ? (
        // Under 18 the decision is a guardian's, but the ASK is the athlete's. Before this they
        // had no route at all: consent could only move if a guardian happened to raise it with a
        // coach, so a minor who wanted back in could not say so.
        <div className="space-y-2 rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {t("A parent or guardian signs this off while you're under 18. Send them a request and they can approve it in their own account.")}
          </p>
          {pendingRequest ? (
            <p className="text-sm font-medium">
              {pendingRequest.requestedGranted
                ? t("Waiting on your guardian to approve turning this on.")
                : t("Waiting on your guardian to approve turning this off.")}
            </p>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={requestChange.isPending}
              onClick={() => requestChange.mutate(!status.granted)}
            >
              {status.granted ? t("Ask my guardian to turn this off") : t("Ask my guardian to turn this on")}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={status.granted ? "default" : "outline"}
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(true)}
          >
            {t("Opted in")}
          </Button>
          <Button
            variant={!status.granted ? "default" : "outline"}
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            {t("Opted out")}
          </Button>
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
          >
            {showText ? t("Hide what you're agreeing to") : t("Read what you're agreeing to")}
          </button>
        </div>
      )}

      {showText && consentText && (
        <div>
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
            {consentText.text}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {t("Keep a copy:")} <a href="/research-consent" className="underline">{t("read it as a page")}</a>
            </span>
            <DownloadButton
              url="/api/legal-documents/research_consent.pdf"
              filename="forge-research-consent.pdf"
              shareTitle="Forge Research Consent"
              label={t("Download PDF")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
