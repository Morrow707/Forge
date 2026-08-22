import { type ReactNode, type CSSProperties, useState } from "react";
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
  GraduationCap,
  BookOpen,
  HardDrive,
  TrendingUp,
  FileText,
  Camera,
  Palette,
  ShieldCheck,
  Trash2,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ForgeMark } from "@/components/forge-mark";
import { EditMyProfileDialog } from "@/components/edit-my-profile-dialog";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { ReportProblemDialog } from "@/components/report-problem-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsDialog } from "@/components/notification-settings-dialog";
import { CoachingStaffDialog } from "@/components/coaching-staff-dialog";
import { TeamBrandingDialog } from "@/components/team-branding-dialog";
import { NonIosTrackingNotice } from "@/components/non-ios-tracking-warning";
import { hexToHslTriplet, contrastForegroundHsl } from "@/lib/color";
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
   * scrolling (coach today: 9 items plus Coaches Corner, the account
   * button, and the bell). Unused by roles with fewer items. */
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
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Flame, exact: true },
  { href: "/admin/my", label: "My Calendar", icon: CalendarDays },
  { href: "/admin/exercises", label: "Forge Library", icon: Dumbbell },
  { href: "/admin/programs", label: "Forge Programs", icon: CalendarRange },
  { href: "/admin/classes", label: "Forge Classes", icon: GraduationCap },
  { href: "/admin/classes-analytics", label: "Class Analytics", icon: TrendingUp },
  { href: "/admin/coaches-corner", label: "Coaches Corner", icon: BookOpen },
  { href: "/admin/review", label: "Review Queue", icon: ClipboardCheck },
  { href: "/admin/forge-ai", label: "Forge AI", icon: Sparkles },
  { href: "/admin/platform-trends", label: "Platform Trends", icon: BarChart3 },
  { href: "/admin/videos", label: "Video Storage", icon: HardDrive },
  { href: "/admin/legal-agreement", label: "Legal Agreement", icon: FileText },
  { href: "/admin/documents", label: "Documents", icon: ShieldCheck },
  { href: "/admin/problem-reports", label: "Problem Reports", icon: Flag },
];

export function AppShell({
  children,
  title,
  actions,
  subheader,
  fitScreen,
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
}) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [coachingStaffOpen, setCoachingStaffOpen] = useState(false);
  const [teamBrandingOpen, setTeamBrandingOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [reportProblemOpen, setReportProblemOpen] = useState(false);
  const [moreNavOpen, setMoreNavOpen] = useState(false);

  // Resolved server-side: a coach's own team settings, or their athlete's
  // coach's -- see getEffectiveBrandingForUser in storage.ts. Drives the
  // header logo/name/colors below and which optional nav sections show.
  const { data: branding } = useQuery<{
    teamName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    features: Record<CoachFeature, boolean>;
  }>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // hsl(var(--primary)) etc. (see tailwind.config.ts) read these as CSS
  // custom properties, so overriding them here on the shell's own root
  // recolors every bg-primary/text-primary/border-ring use inside it --
  // active nav tab, buttons, focus rings -- without touching each
  // component individually. Only --primary/--ring/--accent (and their
  // foregrounds) move; --secondary stays the app's own dark neutral
  // surface color (see index.css) since a huge amount of unrelated chrome
  // assumes that's always a dark gray, not a coach's second brand color.
  const brandStyle = (() => {
    if (!branding?.primaryColor) return undefined;
    const triplet = hexToHslTriplet(branding.primaryColor);
    if (!triplet) return undefined;
    const fg = contrastForegroundHsl(branding.primaryColor);
    return {
      "--primary": triplet,
      "--primary-foreground": fg,
      "--ring": triplet,
      "--accent": triplet,
      "--accent-foreground": fg,
    } as CSSProperties;
  })();

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
      ? coachNav
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
      style={brandStyle}
    >
      {/* paddingTop here (not on the inner row) so the surface color itself
          extends up under the iPhone notch/Dynamic Island instead of leaving
          a gap -- only the content below needs pushing down, not the bar. */}
      <div
        className="sticky top-0 z-30 shrink-0 border-b border-white/10 bg-surface/70 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] backdrop-blur-xl backdrop-saturate-150"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          // A coach's second brand color gets exactly this one bounded,
          // cosmetic use -- nothing structural reads --secondary here, so
          // there's no risk of it fighting the dark-neutral --secondary
          // token the rest of the app's chrome assumes (see brandStyle's
          // own comment above).
          ...(branding?.secondaryColor
            ? { borderBottomColor: branding.secondaryColor, borderBottomWidth: 3 }
            : {}),
        }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            {branding?.logoUrl ? (
              <img
                src={resolveApiUrl(branding.logoUrl)}
                alt={branding.teamName ?? "Team logo"}
                className="h-8 w-8 shrink-0 rounded-md object-contain"
              />
            ) : (
              <ForgeMark className="h-8 w-8 shrink-0 rounded-md" />
            )}
            <div className="flex flex-col leading-none">
              <span className="font-display text-xl font-extrabold uppercase tracking-wider">
                {branding?.teamName || "Forge"}
              </span>
              {(branding?.teamName || branding?.logoUrl) && (
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  Powered by Forge Performance
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
                  {item.label}
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
                    {isFreeAgent ? "Free Agent" : user?.role}
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
                  {user?.role === "coach" && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTeamBrandingOpen(true);
                        setAccountMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-surface-elevated"
                    >
                      <Palette className="h-4 w-4" />
                      Team branding
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

        {mobileNavOpen && (
          <div className="border-t border-border px-4 py-3 md:hidden">
            {/* Name/role gets its own row, above the tabs -- crammed into the
                same row as Notifications/Staff/Log out (below) it was
                truncating down to a few characters on a real phone width. */}
            <div className="mb-3 min-w-0">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">
                {isFreeAgent ? "Free Agent" : user?.role}
              </p>
            </div>
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
                    {item.label}
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
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {user?.role === "athlete" && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
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
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
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
                  className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
                >
                  <Flag className="h-4 w-4" />
                  Report a problem
                </button>
                {user?.role === "coach" && (
                  <button
                    type="button"
                    onClick={() => {
                      setCoachingStaffOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
                  >
                    <UserPlus className="h-4 w-4" />
                    Staff
                  </button>
                )}
                {user?.role === "coach" && (
                  <button
                    type="button"
                    onClick={() => {
                      setTeamBrandingOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
                  >
                    <Palette className="h-4 w-4" />
                    Branding
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => logoutMutation.mutate()}
                  className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteAccountOpen(true);
                    setMobileNavOpen(false);
                  }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete account
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

      <div className={cn("flex w-full flex-col", fitScreen ? "flex-1 md:min-h-0" : "flex-1")}>
        <main
          className={cn(
            fitScreen
              ? "flex-1 px-4 py-4 md:min-h-0 md:overflow-hidden md:px-8"
              : "flex-1 px-4 py-6 md:px-8 md:py-8",
          )}
        >
          {children}
        </main>
      </div>

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
      {user?.role === "coach" && (
        <TeamBrandingDialog open={teamBrandingOpen} onOpenChange={setTeamBrandingOpen} />
      )}
      {user && <DeleteAccountDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen} />}
      {user && <ReportProblemDialog open={reportProblemOpen} onOpenChange={setReportProblemOpen} />}
      <NonIosTrackingNotice />
    </div>
  );
}
