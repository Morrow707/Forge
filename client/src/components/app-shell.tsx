import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import {
  Dumbbell,
  Users,
  CalendarDays,
  LogOut,
  Flame,
  ClipboardCheck,
  LineChart,
  Menu,
  X,
  UserCircle,
  Trophy,
  CalendarRange,
  Settings,
  MessagesSquare,
  Sparkles,
  UserPlus,
  Apple,
  BarChart3,
  ChevronDown,
  Palette,
  SlidersHorizontal,
  UserCog,
  Info,
  CreditCard,
  Camera,
  GraduationCap,
  BookOpen,
  HardDrive,
  Target,
  TrendingUp,
  FileText,
  ShieldCheck,
  Trash2,
  Flag,
  MonitorSmartphone,
  KeyRound,
  Pin,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ForgeMark } from "@/components/forge-mark";
import { AthleteAvatar } from "@/components/athlete-avatar";
import { EditMyProfileDialog } from "@/components/edit-my-profile-dialog";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { GuardianAccessDialog } from "@/components/guardian-access-dialog";
import { ReportProblemDialog } from "@/components/report-problem-dialog";
import { MfaSettingsDialog } from "@/components/mfa-settings-dialog";
import { ActiveSessionsDialog } from "@/components/active-sessions-dialog";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { EmailVerificationBanner } from "@/components/email-verification-banner";
import { DateOfBirthBanner } from "@/components/date-of-birth-banner";
import { InstitutionalAgreementBanner } from "@/components/institutional-agreement-banner";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsDialog } from "@/components/notification-settings-dialog";
import { CoachingStaffDialog } from "@/components/coaching-staff-dialog";
import { TeamBrandingDialog } from "@/components/team-branding-dialog";
import { NavCustomizeDialog } from "@/components/nav-customize-dialog";
import { AccountSettingsDialog } from "@/components/account-settings-dialog";
import { NonIosTrackingNotice } from "@/components/non-ios-tracking-warning";
import { PoweredByFooter } from "@/components/powered-by-footer";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";
import { computeBrandingStyle, type EffectiveBranding } from "@/lib/branding-style";
import { COACH_FEATURE_FIELDS, type CoachFeature } from "@shared/team-features";
import { COACH_SECTION_NAV_HREFS } from "@shared/coach-sections";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** For a nav item that stands in for more than one route (e.g. Library
   * covers both /coach/programs and /coach/exercises) -- highlights the tab
   * whenever the current location starts with ANY of these, instead of just
   * `href`. */
  matchPrefixes?: string[];
  /** Tucked into the "More" dropdown instead of sitting inline in the top
   * bar -- for a role whose full nav is wide enough to force horizontal
   * scrolling (coach: 9 items plus Coaches Corner, the account button, and
   * the bell; admin: 14 items). Unused by roles with fewer items. */
  overflow?: boolean;
};

const coachNav: NavItem[] = [
  { href: "/coach", label: "Dashboard", icon: Flame, exact: true },
  { href: "/coach/calendar", label: "Calendar", icon: CalendarDays },
  {
    href: "/coach/programs",
    label: "Library",
    icon: Dumbbell,
    matchPrefixes: [
      "/coach/programs",
      "/coach/exercises",
      "/coach/skill-programs",
      "/coach/skills",
      "/coach/classes",
    ],
  },
  { href: "/coach/roster", label: "Roster & Teams", icon: Users },
  { href: "/coach/analytics", label: "Analytics", icon: LineChart },
  { href: "/coach/movement-screens", label: "Movement Screens", icon: ClipboardCheck, overflow: true },
  { href: "/coach/nutrition", label: "Nutrition", icon: Apple, overflow: true },
  { href: "/coach/leaderboard", label: "Leaderboard", icon: Trophy, overflow: true },
  { href: "/coach/team-board", label: "Team Board", icon: MessagesSquare, overflow: true },
  { href: "/coach/my", label: "My Training", icon: UserCircle, overflow: true },
  { href: "/coach/about", label: "About", icon: Info, overflow: true },
];

const athleteNav: NavItem[] = [
  { href: "/athlete", label: "Dashboard", icon: Flame, exact: true },
  { href: "/athlete/calendar", label: "Calendar", icon: CalendarDays },
  {
    href: "/athlete/programs",
    label: "Library",
    icon: Dumbbell,
    // Strength and Skills are independently paywalled for a Free Agent (see
    // requirePaidAiAccess in routes.ts), but the nav tab itself covers both
    // -- same "browse freely, AI features paywalled inside" shape as the
    // rest of this page, and matches the coach's own Library tab exactly.
    matchPrefixes: [
      "/athlete/programs",
      "/athlete/exercises",
      "/athlete/skill-programs",
      "/athlete/skills",
    ],
  },
  // The self-guided, scheduled counterpart to the AI Chat's make-it-up-as-
  // you-go coaching -- its own nav entry rather than folded into Library,
  // since browsing/enrolling here is never AI-gated at all.
  { href: "/athlete/classes", label: "Classes", icon: GraduationCap },
  { href: "/athlete/progress", label: "Progress", icon: LineChart },
  { href: "/athlete/nutrition", label: "Nutrition", icon: Apple },
  { href: "/athlete/team-board", label: "Team Board", icon: MessagesSquare },
  { href: "/athlete/chat", label: "AI Chat", icon: Sparkles },
  // Overflow, not primary -- same "engagement nicety, not daily-use" call
  // as the coach nav's own Leaderboard entry, which already lives there.
  { href: "/athlete/leaderboard", label: "Leaderboard", icon: Trophy, overflow: true },
  { href: "/athlete/about", label: "About", icon: Info },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Flame, exact: true },
  { href: "/admin/my", label: "My Calendar", icon: CalendarDays },
  { href: "/admin/exercises", label: "Forge Library", icon: Dumbbell },
  { href: "/admin/skills", label: "Forge Skill Bank", icon: Target, overflow: true },
  { href: "/admin/programs", label: "Forge Programs", icon: CalendarRange },
  { href: "/admin/classes", label: "Forge Classes", icon: GraduationCap },
  // Same overflow treatment as coachNav above -- at 14+ items, admin's full
  // nav was the one role actually forced into horizontal scroll instead of
  // getting the "More" dropdown this exact problem already has a fix for.
  { href: "/admin/classes-analytics", label: "Class Analytics", icon: TrendingUp, overflow: true },
  { href: "/admin/coaches-corner", label: "Coaches Corner", icon: BookOpen, overflow: true },
  { href: "/admin/review", label: "Review Queue", icon: ClipboardCheck, overflow: true },
  { href: "/admin/ai-knowledge", label: "Teach AI", icon: Sparkles, overflow: true },
  { href: "/admin/forge-ai", label: "Forge AI", icon: Sparkles, overflow: true },
  { href: "/admin/nutrition-knowledge", label: "Teach Nutrition AI", icon: Apple, overflow: true },
  { href: "/admin/movement-knowledge", label: "Teach Movement AI", icon: Camera, overflow: true },
  { href: "/admin/platform-trends", label: "Platform Trends", icon: BarChart3, overflow: true },
  { href: "/admin/billing", label: "Billing", icon: CreditCard, overflow: true },
  { href: "/admin/users", label: "Users", icon: Users, overflow: true },
  { href: "/admin/videos", label: "Video Storage", icon: HardDrive, overflow: true },
  { href: "/admin/legal-agreement", label: "Legal Agreement", icon: FileText, overflow: true },
  { href: "/admin/documents", label: "Documents", icon: ShieldCheck, overflow: true },
  { href: "/admin/problem-reports", label: "Problem Reports", icon: Flag, overflow: true },
];

export function AppShell({
  children,
  title,
  actions,
  subheader,
  fitScreen,
  showWatermark = true,
}: {
  children: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  /** Thin strip rendered between the title header and the page content --
   * used for a tab switcher (see LibraryTabs) that a page wants visible
   * without cramming it into the title `<h1>` itself. */
  subheader?: ReactNode;
  /** Constrains content to the viewport instead of letting the page scroll -- opt in per page. */
  fitScreen?: boolean;
  /** Small "Powered by Forge" mark under a page's own content -- on by
   * default, opt OUT per page (a still-rough page, a fitScreen page where it
   * would sit oddly against a pinned bottom bar, etc.) rather than opt in,
   * so new pages get it automatically. See PoweredByFooter's own comment. */
  showWatermark?: boolean;
}) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  // Measured height of the sticky brand/nav/title/subheader bar just below,
  // published as a CSS var on the root element -- lets a page nest its own
  // sticky element (e.g. a sticky table header) underneath this bar without
  // hardcoding a pixel offset that would drift out of sync the moment the
  // bar's real height changes (title/actions wrapping to two lines on a
  // narrow phone, the mobile nav panel opening, a coach's branding logo
  // loading in). ResizeObserver keeps it correct through all of that, not
  // just on mount.
  const stickyBarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = stickyBarRef.current;
    if (!el) return;
    const publishHeight = () => {
      document.documentElement.style.setProperty("--app-shell-sticky-height", `${el.offsetHeight}px`);
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [coachingStaffOpen, setCoachingStaffOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [navCustomizeOpen, setNavCustomizeOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [guardianAccessOpen, setGuardianAccessOpen] = useState(false);
  const [reportProblemOpen, setReportProblemOpen] = useState(false);
  const [mfaSettingsOpen, setMfaSettingsOpen] = useState(false);
  const [activeSessionsOpen, setActiveSessionsOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [moreNavOpen, setMoreNavOpen] = useState(false);

  // Resolved server-side: a coach's own team settings, or their athlete's
  // coach's -- see getEffectiveBrandingForUser in storage.ts. Drives the
  // header logo/name/colors below and which optional nav sections show.
  // Any authenticated role can be on the receiving end of someone else's
  // branding (an athlete wearing their coach's colors) even though only a
  // coach can edit it.
  const { data: branding } = useQuery<EffectiveBranding & { features: Record<CoachFeature, boolean> }>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // hsl(var(--primary)) etc. (see tailwind.config.ts) read these as CSS
  // custom properties, so overriding them here on the shell's own root
  // recolors every bg-primary/text-primary/border-ring use inside it --
  // active nav tab, buttons, focus rings -- without touching each
  // component individually.
  const brandingStyle = computeBrandingStyle(
    branding,
    user?.role === "coach"
      ? {
          accentColor: user.personalAccentColor,
          secondaryColor: user.personalSecondaryColor,
          backgroundHue: user.personalBackgroundHue,
        }
      : null,
  );

  // Best-effort branded icon: swaps the browser tab favicon and (in
  // practice) iOS's "Add to Home Screen" icon, since Safari reads these
  // <link> tags from the live DOM at the moment someone saves the page --
  // not a snapshot taken at some earlier load. This does NOT reach
  // Android/Chrome's home-screen icon, which instead comes from the
  // build-time manifest.webmanifest (see vite.config.ts's VitePWA config)
  // and is fetched once per origin, not re-read per session -- a real
  // platform limitation, not a bug, and a deliberate scope decision (full
  // per-tenant manifest generation is its own, much larger project).
  // Reverts to the static Forge defaults the moment branding clears
  // (logo removed, or an unbranded user's session loads), rather than
  // leaving a previous session's icon stuck.
  useEffect(() => {
    const logoHref = branding?.brandLogoUrl ? resolveApiUrl(branding.brandLogoUrl) : null;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const appleTouchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (favicon) favicon.href = logoHref ?? "/favicon-32.png";
    if (appleTouchIcon) appleTouchIcon.href = logoHref ?? "/apple-touch-icon.png";
  }, [branding?.brandLogoUrl]);

  const disabledNavHrefs = new Set<string>();
  if (branding?.features) {
    for (const field of COACH_FEATURE_FIELDS) {
      if (branding.features[field.key] === false) {
        for (const href of field.navHrefs) disabledNavHrefs.add(href);
      }
    }
  }
  // Per-staff-member restriction, set by the primary coach (see the Staff
  // dialog) -- distinct from the team-wide branding.features toggles above,
  // which hide a tab for the whole team, athletes included. This only ever
  // narrows what THIS ONE staff coach's own nav shows; empty for the
  // primary coach and anyone not on a staff at all.
  if (user?.role === "coach" && user.hiddenSections) {
    for (const section of user.hiddenSections) {
      for (const href of COACH_SECTION_NAV_HREFS[section] ?? []) disabledNavHrefs.add(href);
    }
  }

  const { data: navPrefs } = useQuery<{
    hiddenNavSections: string[];
    navLabelOverrides: Record<string, string>;
  }>({
    queryKey: ["/api/coach/nav-prefs"],
    queryFn: () => getJson("/api/coach/nav-prefs"),
    enabled: user?.role === "coach",
  });
  const hiddenNavSections = new Set(navPrefs?.hiddenNavSections ?? []);
  const navLabelOverrides = navPrefs?.navLabelOverrides ?? {};
  function navLabel(item: NavItem) {
    return navLabelOverrides[item.href] || item.label;
  }

  // Same /api/coach/roster query (and cache) AthleteSwitcher and the roster
  // page already fetch from -- id+name is all a "Pinned" chip needs to
  // show or link to, so this reuses that cache instead of standing up a
  // dedicated endpoint just for names. The pin ids themselves ride along on
  // the logged-in coach's own /api/auth/me response (users.pinnedAthleteIds),
  // no separate fetch for those either.
  const pinnedAthleteIds = user?.role === "coach" ? (user.pinnedAthleteIds ?? []) : [];
  const { data: pinnableRoster } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/coach/roster"],
    queryFn: () => getJson("/api/coach/roster"),
    enabled: pinnedAthleteIds.length > 0,
  });
  // Preserves pin order (most-recently-pinned last) rather than roster
  // order -- a coach who pins their two most-visited athletes wants THOSE
  // two first, not wherever they happen to fall alphabetically.
  const pinnedAthletes = pinnedAthleteIds
    .map((id) => pinnableRoster?.find((a) => a.id === id))
    .filter((a): a is { id: number; name: string } => !!a);

  // Same query (and cache) the athlete dashboard's empty-state uses to
  // decide Free Agent status -- zero coaches linked. The "My Programs" and
  // "AI Chat" nav entries only make sense while that's true: once a coach is
  // on the account, both AI features are server-gated off too (see
  // requireFreeAgent in routes.ts) -- the coach is the athlete's guidance
  // now, not the AI -- so leaving either tab visible would just lead to a
  // 403 instead of actually going away like it's supposed to.
  const { data: coaches } = useQuery<{ id: number }[]>({
    queryKey: ["/api/athlete/coaches"],
    enabled: user?.role === "athlete",
  });
  const isFreeAgent = user?.role === "athlete" && !!coaches && coaches.length === 0;

  const nav = (
    user?.role === "coach"
      ? coachNav.filter((item) => !hiddenNavSections.has(item.href))
      : user?.role === "admin"
        ? adminNav
        : isFreeAgent
          // A Free Agent has no team, so Team Board (a coach's roster-wide
          // chat) has nobody on the other end -- same "would just 403/be
          // empty" reasoning as the coached-athlete filter below.
          ? athleteNav.filter((item) => item.href !== "/athlete/team-board")
          : athleteNav.filter((item) => item.href !== "/athlete/programs" && item.href !== "/athlete/chat")
  ).filter((item) => !disabledNavHrefs.has(item.href));
  const primaryNav = nav.filter((item) => !item.overflow);
  const overflowNav = nav.filter((item) => item.overflow);

  const teamBoardUnreadUrl =
    user?.role === "coach"
      ? "/api/coach/team-board/unread"
      : user?.role === "athlete"
        ? "/api/athlete/team-board/unread"
        : null;
  const { data: teamBoardUnread } = useQuery<{ hasUnread: boolean }>({
    queryKey: [teamBoardUnreadUrl],
    queryFn: () => getJson(teamBoardUnreadUrl!),
    enabled: !!teamBoardUnreadUrl,
    refetchInterval: 60_000,
  });

  function isActive(item: NavItem) {
    if (item.matchPrefixes) return item.matchPrefixes.some((p) => location.startsWith(p));
    return item.exact ? location === item.href : location.startsWith(item.href);
  }

  return (
    <div
      className={cn(
        // overflow-x-hidden here is a page-wide safety net, not a fix for
        // one spot -- individual wide content (tables, long code blocks)
        // should scroll inside its own overflow-x-auto container instead of
        // ever growing the page itself past the viewport width.
        "app-shell-root min-h-screen overflow-x-hidden bg-background",
        fitScreen && "flex flex-col md:h-screen md:overflow-hidden",
      )}
      style={brandingStyle}
    >
      {/* paddingTop here (not on the inner row) so the surface color itself
          extends up under the iPhone notch/Dynamic Island instead of leaving
          a gap -- only the content below needs pushing down, not the bar. */}
      <div
        ref={stickyBarRef}
        className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-surface/70 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl backdrop-saturate-150"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          // A coach's second brand color gets exactly this one bounded,
          // cosmetic use -- nothing structural reads --secondary here, so
          // there's no risk of it fighting the dark-neutral --secondary
          // token the rest of the app's chrome assumes (see computeBrandingStyle's
          // own comment).
          ...(branding?.brandSecondaryColor
            ? { borderBottomColor: branding.brandSecondaryColor, borderBottomWidth: 3 }
            : {}),
        }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            {branding?.brandLogoUrl ? (
              <img
                src={resolveApiUrl(branding.brandLogoUrl)}
                alt={branding.brandTeamName || "Team logo"}
                className="h-8 w-8 shrink-0 rounded-md object-contain"
              />
            ) : (
              <ForgeMark className="h-8 w-8 shrink-0 rounded-md" />
            )}
            <div className="flex flex-col leading-none">
              <span className="font-display text-xl font-extrabold uppercase tracking-wider">
                {branding?.brandTeamName || "Forge"}
              </span>
              {(branding?.brandTeamName || branding?.brandLogoUrl) && (
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {POWERED_BY_FORGE_LABEL}
                </span>
              )}
            </div>
          </div>

          {/* justify-start, not center -- when every item fits this looks
              identical either way, but once the roster grows past what
              fits, centering an overflowing flex row clips it evenly from
              BOTH edges with no visible cue that there's more to scroll to.
              Left-aligned overflows the same way a normal scrollable list
              does: nothing missing on the left, a natural scroll to reveal
              the rest on the right. */}
          <nav className="hidden min-w-0 flex-1 items-center justify-start gap-0.5 overflow-x-auto md:flex">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              const showUnreadDot = item.href.endsWith("/team-board") && teamBoardUnread?.hasUnread;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {navLabel(item)}
                  {showUnreadDot && (
                    <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-black">
                      New
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {/* Everything below the top ~5 items for a coach (Movement
                Screens, Nutrition, Leaderboard, Team Board) -- keeps this
                one from ever needing horizontal scroll the way the full,
                un-split coach nav did once Movement Screens shipped.
                Deliberately outside the scrollable <nav> above so it's
                always reachable regardless of window width, same reasoning
                as the account menu sitting out here. */}
            {overflowNav.length > 0 && (
              <div
                className="relative hidden md:block"
                onMouseEnter={() => setMoreNavOpen(true)}
                onMouseLeave={() => setMoreNavOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setMoreNavOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={moreNavOpen}
                  className={cn(
                    "flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-semibold transition-colors",
                    overflowNav.some((item) => isActive(item))
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                  )}
                >
                  More
                  {overflowNav.some(
                    (item) => item.href.endsWith("/team-board") && teamBoardUnread?.hasUnread,
                  ) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-transform",
                      moreNavOpen && "rotate-180",
                    )}
                  />
                </button>
                {moreNavOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-surface/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_8px_30px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150"
                  >
                    {overflowNav.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item);
                      const showUnreadDot =
                        item.href.endsWith("/team-board") && teamBoardUnread?.hasUnread;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setMoreNavOpen(false)}
                          className={cn(
                            "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium hover:bg-surface-elevated",
                            active ? "text-primary" : "text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                          {showUnreadDot && (
                            <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-black">
                              New
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* Deliberately NOT one of the main nav tabs above (which mixes
                it in visually with Team Board and the rest) -- this is a
                coach's own paid upgrade, not a team feature, so it sits
                here instead, right next to the account menu, to read as a
                distinct, personal area of the app. */}
            {user?.role === "coach" && (
              <Link
                href="/coach/coaches-corner"
                className={cn(
                  "hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition-colors md:flex",
                  location.startsWith("/coach/coaches-corner")
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-amber-500/40 text-amber-500 hover:bg-amber-500/10",
                )}
              >
                <BookOpen className="h-4 w-4" />
                Coaches Corner
              </Link>
            )}
            {/* Hoverable on desktop (mouse enter/leave), click-toggleable for
                touch, since touch devices never fire hover -- the trigger's
                own onClick covers that case. Keeps Settings/Coaching
                Staff/Logout out of the top bar so they stop competing with
                the nav tabs for width; the notifications bell deliberately
                stays outside this menu; see NotificationBell below,
                unmoved. */}
            <div
              className="relative hidden md:block"
              onMouseEnter={() => setAccountMenuOpen(true)}
              onMouseLeave={() => setAccountMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 hover:bg-surface-elevated"
              >
                <span className="min-w-0 text-right">
                  <span className="block truncate text-sm font-semibold">{user?.name}</span>
                  <span className="block truncate text-xs capitalize text-muted-foreground">
                    {user?.staffTitle || (isFreeAgent ? "Free Agent" : user?.role)}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    accountMenuOpen && "rotate-180",
                  )}
                />
              </button>
              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-xl border border-white/10 bg-surface/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_8px_30px_-10px_rgba(0,0,0,0.6)] backdrop-blur-xl backdrop-saturate-150"
                >
                  {user && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountSettingsOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <UserCog className="h-4 w-4" />
                      Account settings
                    </button>
                  )}
                  {user?.role === "athlete" && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <UserCircle className="h-4 w-4" />
                      Edit profile
                    </button>
                  )}
                  {(user?.role === "coach" || user?.role === "athlete") && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setNotifSettingsOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <Settings className="h-4 w-4" />
                      Notification settings
                    </button>
                  )}
                  {/* Tucked right under Notification settings rather than
                      given its own top-level spot -- reporting a bug isn't
                      something most people need often, so it doesn't need
                      to compete for attention the way Log out/Delete
                      account (both destructive, both need to stay visible)
                      do. */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setReportProblemOpen(true);
                      setAccountMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                  >
                    <Flag className="h-4 w-4" />
                    Report a problem
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSessionsOpen(true);
                      setAccountMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                  >
                    <MonitorSmartphone className="h-4 w-4" />
                    Where you're logged in
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setChangePasswordOpen(true);
                      setAccountMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                  >
                    <KeyRound className="h-4 w-4" />
                    Change password
                  </button>
                  {(user?.role === "coach" || user?.role === "admin") && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMfaSettingsOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Two-factor authentication
                    </button>
                  )}
                  {user?.role === "coach" && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCoachingStaffOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <UserPlus className="h-4 w-4" />
                      Coaching staff
                    </button>
                  )}
                  {user?.role === "coach" && user.isPrimaryCoach && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setBrandingOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <Palette className="h-4 w-4" />
                      Branding
                    </button>
                  )}
                  {user?.role === "coach" && user.isPrimaryCoach && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setNavCustomizeOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      Customize navigation
                    </button>
                  )}
                  {Capacitor.getPlatform() === "ios" && (
                    <Link
                      href="/dev/ar-preview-test"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-surface-elevated"
                    >
                      <Camera className="h-4 w-4" />
                      ARKit preview test
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => logoutMutation.mutate()}
                    className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-left text-sm font-medium text-destructive hover:bg-surface-elevated"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                  {user?.role === "athlete" && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setGuardianAccessOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Guardian access
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDeleteAccountOpen(true);
                      setAccountMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-destructive/70 hover:bg-surface-elevated"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete account
                  </button>
                </div>
              )}
            </div>
            {(user?.role === "coach" || user?.role === "athlete") && <NotificationBell />}
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileNavOpen}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground md:hidden"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Fast access to a coach's own most-visited athletes -- see
            athlete-detail.tsx's pin toggle. Its own thin row (not folded
            into the primaryNav row above) since avatar+name chips read very
            differently from the icon+label tab buttons, and only ever
            appears once there's at least one pin. */}
        {pinnedAthletes.length > 0 && (
          <div className="hidden items-center gap-1 border-t border-white/10 px-4 py-1.5 md:flex md:px-8">
            <span className="flex shrink-0 items-center gap-1 pr-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Pin className="h-3 w-3" />
              Pinned
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {pinnedAthletes.map((athlete) => {
                const href = `/coach/roster/${athlete.id}`;
                const active = location === href;
                return (
                  <Link
                    key={athlete.id}
                    href={href}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md py-1 pl-1 pr-2 text-xs font-semibold transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                    )}
                  >
                    <AthleteAvatar name={athlete.name} size="sm" />
                    <span className="max-w-[8rem] truncate">{athlete.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {mobileNavOpen && (
          <div className="border-t border-border px-4 py-3 md:hidden">
            {/* Name/role gets its own row, above the tabs -- crammed into the
                same row as Notifications/Staff/Log out (below) it was
                truncating down to a few characters on a real phone width. */}
            <div className="mb-3 min-w-0">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">
                {user?.staffTitle || (isFreeAgent ? "Free Agent" : user?.role)}
              </p>
            </div>
            {pinnedAthletes.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2 border-b border-border pb-3">
                {pinnedAthletes.map((athlete) => {
                  const href = `/coach/roster/${athlete.id}`;
                  const active = location === href;
                  return (
                    <Link
                      key={athlete.id}
                      href={href}
                      onClick={() => setMobileNavOpen(false)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-semibold transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      <AthleteAvatar name={athlete.name} size="sm" />
                      {athlete.name}
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                const showUnreadDot = item.href.endsWith("/team-board") && teamBoardUnread?.hasUnread;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {navLabel(item)}
                    {showUnreadDot && (
                      <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-black">
                        New
                      </span>
                    )}
                  </Link>
                );
              })}
              {user?.role === "coach" && (
                <Link
                  href="/coach/coaches-corner"
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    location.startsWith("/coach/coaches-corner")
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-amber-500/40 text-amber-500 hover:bg-amber-500/10",
                  )}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Coaches Corner
                </Link>
              )}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <div className="min-w-0 pb-2">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {user?.staffTitle || (isFreeAgent ? "Free Agent" : user?.role)}
                </p>
              </div>
              {/* One uniform full-width row per item (matching the desktop
                  dropdown just above) rather than a flex-wrap grid -- at
                  varying label lengths ("2FA" vs. "Report a problem") a
                  wrapping grid reads as an inconsistent jumble instead of a
                  single clean list. Log out and Delete account are pinned
                  last (in that order) and get the same destructive-color
                  treatment as the desktop dropdown; every other item shares
                  one identical row style regardless of role. */}
              <div className="flex flex-col">
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountSettingsOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <UserCog className="h-4 w-4" />
                    Account
                  </button>
                )}
                {user?.role === "athlete" && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <UserCircle className="h-4 w-4" />
                    Profile
                  </button>
                )}
                {(user?.role === "coach" || user?.role === "athlete") && (
                  <button
                    type="button"
                    onClick={() => {
                      setNotifSettingsOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <Settings className="h-4 w-4" />
                    Notifications
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReportProblemOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                >
                  <Flag className="h-4 w-4" />
                  Report a problem
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSessionsOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                >
                  <MonitorSmartphone className="h-4 w-4" />
                  Devices
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChangePasswordOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                >
                  <KeyRound className="h-4 w-4" />
                  Password
                </button>
                {(user?.role === "coach" || user?.role === "admin") && (
                  <button
                    type="button"
                    onClick={() => {
                      setMfaSettingsOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    2FA
                  </button>
                )}
                {user?.role === "coach" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCoachingStaffOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <UserPlus className="h-4 w-4" />
                    Staff
                  </button>
                )}
                {user?.role === "coach" && user.isPrimaryCoach && (
                  <button
                    type="button"
                    onClick={() => {
                      setBrandingOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <Palette className="h-4 w-4" />
                    Branding
                  </button>
                )}
                {user?.role === "coach" && user.isPrimaryCoach && (
                  <button
                    type="button"
                    onClick={() => {
                      setNavCustomizeOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Customize navigation
                  </button>
                )}
                {user?.role === "athlete" && (
                  <button
                    type="button"
                    onClick={() => {
                      setGuardianAccessOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Guardian access
                  </button>
                )}
                {Capacitor.getPlatform() === "ios" && (
                  <Link
                    href="/dev/ar-preview-test"
                    onClick={() => setMobileNavOpen(false)}
                    className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-foreground"
                  >
                    <Camera className="h-4 w-4" />
                    ARKit preview test
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteAccountOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="flex w-full items-center gap-2 border-t border-border py-2 pt-3 text-left text-sm font-semibold text-destructive/70"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete account
                </button>
                <button
                  type="button"
                  onClick={() => logoutMutation.mutate()}
                  className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Title + subheader (e.g. the Library tab switcher) live inside the
            same sticky wrapper as the brand/nav bar above, not the scrolling
            content div below -- previously they scrolled away with the page
            on mobile (no persistent desktop nav row to keep them company
            there), which read as "the tabs disappear when I scroll." */}
        {/* flex-wrap (not the old strict one-line row) -- a title and wide
            actions (e.g. a full-text "New Program" button) used to fight
            over one line on a narrow phone, and the title always lost:
            `truncate` + actions' `shrink-0` squeezed titles like "My
            Progress" down to an unreadable "M...". Now actions wrap to
            their own line under the title instead of crushing it. */}
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/10 bg-background/60 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 md:flex-nowrap md:px-8 md:py-4">
          <h1 className="min-w-0 font-display text-xl font-bold uppercase tracking-wide md:truncate md:text-3xl">
            {title}
          </h1>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">{actions}</div>
        </header>
        {subheader && (
          <div className="border-t border-border bg-background px-4 py-2 md:px-8">{subheader}</div>
        )}
      </div>

      {user && !user.emailVerified && <EmailVerificationBanner />}
      {user && user.role === "athlete" && !user.dateOfBirth && <DateOfBirthBanner />}
      {user && user.role === "coach" && <InstitutionalAgreementBanner />}

      <div className={cn("flex w-full flex-col", fitScreen ? "flex-1 md:min-h-0" : "flex-1")}>
        <main
          className={cn(
            fitScreen
              ? "flex-1 px-4 py-4 md:min-h-0 md:overflow-hidden md:px-8"
              : "flex-1 px-4 py-6 md:px-8 md:py-8",
          )}
        >
          {children}
          {showWatermark && <PoweredByFooter />}
        </main>
      </div>

      {user && (
        <AccountSettingsDialog user={user} open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
      )}
      {user?.role === "athlete" && (
        <EditMyProfileDialog user={user} open={profileOpen} onOpenChange={setProfileOpen} />
      )}
      {(user?.role === "coach" || user?.role === "athlete") && (
        <NotificationSettingsDialog
          user={user}
          open={notifSettingsOpen}
          onOpenChange={setNotifSettingsOpen}
        />
      )}
      {user?.role === "coach" && (
        <CoachingStaffDialog open={coachingStaffOpen} onOpenChange={setCoachingStaffOpen} />
      )}
      {user?.role === "coach" && user.isPrimaryCoach && (
        <TeamBrandingDialog open={brandingOpen} onOpenChange={setBrandingOpen} scope={{ type: "org" }} />
      )}
      {user?.role === "coach" && user.isPrimaryCoach && (
        <NavCustomizeDialog
          open={navCustomizeOpen}
          onOpenChange={setNavCustomizeOpen}
          items={coachNav.filter((item) => item.href !== "/coach")}
        />
      )}
      {user && <DeleteAccountDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen} />}
      {user?.role === "athlete" && (
        <GuardianAccessDialog open={guardianAccessOpen} onOpenChange={setGuardianAccessOpen} />
      )}
      {user && <ReportProblemDialog open={reportProblemOpen} onOpenChange={setReportProblemOpen} />}
      {(user?.role === "coach" || user?.role === "admin") && (
        <MfaSettingsDialog open={mfaSettingsOpen} onOpenChange={setMfaSettingsOpen} />
      )}
      {user && <ActiveSessionsDialog open={activeSessionsOpen} onOpenChange={setActiveSessionsOpen} />}
      {user && <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />}
      <NonIosTrackingNotice />
    </div>
  );
}
