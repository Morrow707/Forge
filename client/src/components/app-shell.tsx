import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getJson } from "@/lib/queryClient";
import {
  Dumbbell,
  ListChecks,
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EditMyProfileDialog } from "@/components/edit-my-profile-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsDialog } from "@/components/notification-settings-dialog";
import { CoachingStaffDialog } from "@/components/coaching-staff-dialog";
import { TeamBrandingDialog } from "@/components/team-branding-dialog";
import { NavCustomizeDialog } from "@/components/nav-customize-dialog";
import { AccountSettingsDialog } from "@/components/account-settings-dialog";
import { PoweredByFooter } from "@/components/powered-by-footer";
import { computeBrandingStyle, type EffectiveBranding } from "@/lib/branding-style";

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
};

const coachNav: NavItem[] = [
  { href: "/coach", label: "Dashboard", icon: Flame, exact: true },
  { href: "/coach/calendar", label: "Calendar", icon: CalendarDays },
  {
    href: "/coach/programs",
    label: "Library",
    icon: Dumbbell,
    matchPrefixes: ["/coach/programs", "/coach/exercises"],
  },
  { href: "/coach/roster", label: "Roster & Teams", icon: Users },
  { href: "/coach/nutrition", label: "Nutrition", icon: Apple },
  { href: "/coach/analytics", label: "Analytics", icon: LineChart },
  { href: "/coach/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/coach/team-board", label: "Team Board", icon: MessagesSquare },
  { href: "/coach/about", label: "About", icon: Info },
];

const athleteNav: NavItem[] = [
  { href: "/athlete", label: "Calendar", icon: CalendarDays, exact: true },
  { href: "/athlete/programs", label: "My Programs", icon: ListChecks },
  { href: "/athlete/progress", label: "Progress", icon: LineChart },
  { href: "/athlete/nutrition", label: "Nutrition", icon: Apple },
  { href: "/athlete/team-board", label: "Team Board", icon: MessagesSquare },
  { href: "/athlete/chat", label: "AI Chat", icon: Sparkles },
  { href: "/athlete/about", label: "About", icon: Info },
];

const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Flame, exact: true },
  { href: "/admin/my", label: "My Calendar", icon: CalendarDays },
  { href: "/admin/exercises", label: "Forge Library", icon: Dumbbell },
  { href: "/admin/programs", label: "Forge Programs", icon: CalendarRange },
  { href: "/admin/review", label: "Review Queue", icon: ClipboardCheck },
  { href: "/admin/ai-knowledge", label: "Teach AI", icon: Sparkles },
  { href: "/admin/nutrition-knowledge", label: "Teach Nutrition AI", icon: Apple },
  { href: "/admin/platform-trends", label: "Platform Trends", icon: BarChart3 },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
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
  /** Small translucent "Powered by Forge" mark at the bottom of the page
   * content -- on by default; a handful of secondary/embedded views can
   * opt out so it doesn't show up on every single screen. */
  showWatermark?: boolean;
}) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [coachingStaffOpen, setCoachingStaffOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [navCustomizeOpen, setNavCustomizeOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Any authenticated role can be on the receiving end of someone else's
  // branding (an athlete wearing their coach's colors) even though only a
  // coach can edit it -- see storage.ts's getEffectiveBrandingForUser for
  // how this resolves per role.
  const { data: branding } = useQuery<EffectiveBranding>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
    enabled: !!user,
  });

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

  const brandingStyle = computeBrandingStyle(
    branding,
    user?.role === "coach" ? user.personalAccentColor : null,
  );

  // Runtime favicon/home-screen-icon swap -- covers the browser tab icon
  // and, in practice, iOS's "Add to Home Screen" (which reads these DOM
  // link tags at save time). Android/Chrome's home-screen icon comes from
  // the build-time manifest.webmanifest instead, fetched once per origin,
  // so it will NOT pick this up -- a known, accepted gap, not a bug.
  useEffect(() => {
    const iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const href = branding?.brandLogoUrl || null;
    if (iconLink) iconLink.href = href || "/favicon-32.png";
    if (appleLink) appleLink.href = href || "/apple-touch-icon.png";
  }, [branding?.brandLogoUrl]);

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

  const nav =
    user?.role === "coach"
      ? coachNav.filter((item) => !hiddenNavSections.has(item.href))
      : user?.role === "admin"
        ? adminNav
        : isFreeAgent
          ? athleteNav
          : athleteNav.filter((item) => item.href !== "/athlete/programs" && item.href !== "/athlete/chat");

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
        "min-h-screen bg-background",
        fitScreen && "flex flex-col md:h-screen md:overflow-hidden",
      )}
      style={brandingStyle}
    >
      <div className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            {branding?.brandLogoUrl ? (
              <img
                src={branding.brandLogoUrl}
                alt={branding.brandTeamName || "Team logo"}
                className="h-8 w-8 shrink-0 rounded-md object-contain"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Flame className="h-4.5 w-4.5" />
              </div>
            )}
            <span className="font-display text-xl font-extrabold uppercase tracking-wider">
              {branding?.brandTeamName || "Forge"}
            </span>
          </div>

          {/* justify-start, not center -- when every item fits this looks
              identical either way, but once the roster grows past what
              fits, centering an overflowing flex row clips it evenly from
              BOTH edges with no visible cue that there's more to scroll to.
              Left-aligned overflows the same way a normal scrollable list
              does: nothing missing on the left, a natural scroll to reveal
              the rest on the right. */}
          <nav className="hidden min-w-0 flex-1 items-center justify-start gap-0.5 overflow-x-auto md:flex">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              const showUnreadDot = item.href.endsWith("/team-board") && teamBoardUnread?.hasUnread;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-semibold transition-colors",
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
                  className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => logoutMutation.mutate()}
                    className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-left text-sm font-medium text-destructive hover:bg-surface-elevated"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
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
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {user?.staffTitle || (isFreeAgent ? "Free Agent" : user?.role)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      setAccountSettingsOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
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
                {user?.role === "coach" && user.isPrimaryCoach && (
                  <button
                    type="button"
                    onClick={() => {
                      setBrandingOpen(true);
                      setMobileNavOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
                  >
                    <Palette className="h-4 w-4" />
                    Brand
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
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={cn("flex w-full flex-col", fitScreen ? "flex-1 md:min-h-0" : "flex-1")}>
        <header className="shrink-0 flex items-center justify-between border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide md:text-3xl">
            {title}
          </h1>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">{actions}</div>
        </header>
        {subheader && (
          <div className="shrink-0 border-b border-border bg-background px-4 py-2 md:px-8">
            {subheader}
          </div>
        )}
        <main
          className={cn(
            fitScreen
              ? "flex-1 px-4 py-4 md:min-h-0 md:overflow-hidden md:px-8"
              : "flex-1 px-4 py-6 md:px-8 md:py-8",
          )}
        >
          {children}
        </main>
        {showWatermark && (
          <div className="shrink-0 px-4 md:px-8">
            <PoweredByFooter />
          </div>
        )}
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
    </div>
  );
}
