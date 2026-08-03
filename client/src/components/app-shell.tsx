import { type ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getJson } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EditMyProfileDialog } from "@/components/edit-my-profile-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationSettingsDialog } from "@/components/notification-settings-dialog";
import { WellnessGate } from "@/components/wellness-gate";

const coachNav = [
  { href: "/coach", label: "Dashboard", icon: Flame, exact: true },
  { href: "/coach/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/coach/programs", label: "Programs", icon: ListChecks },
  { href: "/coach/exercises", label: "Exercise Bank", icon: Dumbbell },
  { href: "/coach/roster", label: "Roster & Teams", icon: Users },
  { href: "/coach/analytics", label: "Analytics", icon: LineChart },
  { href: "/coach/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/coach/team-board", label: "Team Board", icon: MessagesSquare },
];

const athleteNav = [
  { href: "/athlete", label: "Calendar", icon: CalendarDays, exact: true },
  { href: "/athlete/progress", label: "Progress", icon: LineChart },
  { href: "/athlete/team-board", label: "Team Board", icon: MessagesSquare },
];

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: Flame, exact: true },
  { href: "/admin/exercises", label: "Forge Library", icon: Dumbbell },
  { href: "/admin/programs", label: "Forge Programs", icon: CalendarRange },
  { href: "/admin/review", label: "Review Queue", icon: ClipboardCheck },
];

export function AppShell({
  children,
  title,
  actions,
  fitScreen,
}: {
  children: ReactNode;
  title: string;
  actions?: ReactNode;
  /** Constrains content to the viewport instead of letting the page scroll -- opt in per page. */
  fitScreen?: boolean;
}) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const nav =
    user?.role === "coach" ? coachNav : user?.role === "admin" ? adminNav : athleteNav;

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

  function isActive(item: { href: string; exact?: boolean }) {
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
              <Flame className="h-4.5 w-4.5" />
            </div>
            <span className="font-display text-xl font-extrabold uppercase tracking-wider">
              Forge
            </span>
          </div>

          <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              const showUnreadDot = item.href.endsWith("/team-board") && teamBoardUnread?.hasUnread;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
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

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-3 md:flex">
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">{user?.role}</p>
              </div>
              {user?.role === "athlete" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setProfileOpen(true)}
                  aria-label="Edit profile"
                >
                  <UserCircle className="h-4 w-4" />
                </Button>
              )}
              {(user?.role === "coach" || user?.role === "athlete") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNotifSettingsOpen(true)}
                  aria-label="Notification settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => logoutMutation.mutate()}
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
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
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="truncate text-xs capitalize text-muted-foreground">{user?.role}</p>
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
      {user?.role === "athlete" && <WellnessGate />}
      {(user?.role === "coach" || user?.role === "athlete") && (
        <NotificationSettingsDialog
          user={user}
          open={notifSettingsOpen}
          onOpenChange={setNotifSettingsOpen}
        />
      )}
    </div>
  );
}
