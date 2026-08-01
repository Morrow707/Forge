import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dumbbell,
  ListChecks,
  Users,
  CalendarDays,
  LogOut,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const coachNav = [
  { href: "/coach", label: "Dashboard", icon: Flame, exact: true },
  { href: "/coach/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/coach/programs", label: "Programs", icon: ListChecks },
  { href: "/coach/exercises", label: "Exercise Bank", icon: Dumbbell },
  { href: "/coach/roster", label: "Roster & Teams", icon: Users },
];

const athleteNav = [
  { href: "/athlete", label: "Calendar", icon: CalendarDays, exact: true },
];

export function AppShell({
  children,
  title,
  actions,
}: {
  children: ReactNode;
  title: string;
  actions?: ReactNode;
}) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const nav = user?.role === "coach" ? coachNav : athleteNav;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Flame className="h-5 w-5" />
          </div>
          <span className="font-display text-2xl font-extrabold uppercase tracking-wider">
            Forge
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const isActive = item.exact
              ? location === item.href
              : location.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          {user?.role === "coach" && user.coachCode && (
            <div className="mb-3 rounded-md bg-surface-elevated p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Your coach code
              </p>
              <p className="font-display text-lg font-bold tracking-widest text-primary">
                {user.coachCode}
              </p>
            </div>
          )}
          <div className="mb-2 flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Badge variant="secondary" className="shrink-0 capitalize">
              {user?.role}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen w-full flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide md:text-3xl">
            {title}
          </h1>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">{actions}</div>
        </header>
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden">
        {nav.map((item) => {
          const isActive = item.exact
            ? location === item.href
            : location.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-muted-foreground"
        >
          <LogOut className="h-5 w-5" />
          Log out
        </button>
      </nav>
    </div>
  );
}
