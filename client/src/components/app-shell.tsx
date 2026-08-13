import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getJson } from "@/lib/queryClient";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ForgeMark } from "@/components/forge-mark";
import { EditMyProfileDialog } from "@/components/edit-my-profile-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsDialog } from "@/components/notification-settings-dialog";
import { CoachingStaffDialog } from "@/components/coaching-staff-dialog";

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
    matchPrefixes: [
      "/coach/programs",
      "/coach/exercises",
      "/coach/skill-programs",
      "/coach/skills",
      "/coach/classes",
    ],
  },
  { href: "/coach/roster", label: "Roster & Teams", icon: Users },
  { href: "/coach/nutrition", label: "Nutrition", icon: Apple },
  { href: "/coach/analytics", label: "Analytics", icon: LineChart },
  { href: "/coach/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/coach/team-board", label: "Team Board", icon: MessagesSquare },
];

const athleteNav: NavItem[] = [
  { href: "/athlete", label: "Calendar", icon: CalendarDays, exact: true },
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
  { href: "/admin/coaches-corner", label: "Coaches Corner", icon: BookOpen },
  { href: "/admin/review", label: "Review Queue", icon: ClipboardCheck },
  { href: "/admin/ai-knowledge", label: "Teach AI", icon: Sparkles },
  { href: "/admin/nutrition-knowledge", label: "Teach Nutrition AI", icon: Apple },
  { href: "/admin/platform-trends", label: "Platform Trends", icon: BarChart3 },
  { href: "/admin/videos", label: "Video Storage", icon: HardDrive },
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

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
      ? coachNav
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
    >
      <div className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ForgeMark className="h-4.5 w-4.5" />
            </div>
            <span className="font-display text-xl font-extrabold uppercase tracking-wider">
              Forge
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
                  className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
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
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">
                  {isFreeAgent ? "Free Agent" : user?.role}
                </p>
              </div>
              <div className="flex items-center gap-3">
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
        <header className="shrink-0 flex flex-col gap-2 border-b border-border bg-background/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:px-8">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide md:text-3xl">
            {title}
          </h1>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto sm:justify-end">{actions}</div>
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
    </div>
  );
}
