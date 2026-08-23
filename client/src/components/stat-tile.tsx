import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

/** One clickable stat card on a dashboard's stat-tile row -- identical
 * between the coach and athlete dashboards (they were two hand-duplicated
 * copies of the exact same markup before this was pulled out), so both now
 * render from this single implementation. */
export function StatTile({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition-colors hover:border-primary/50">
        <CardContent className="flex items-center gap-3 p-3 md:p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold md:text-3xl">{value}</p>
            <p className="truncate text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
