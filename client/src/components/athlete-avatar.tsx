import { cn } from "@/lib/utils";
import { STREAK_TIERS } from "@/components/streak-badge";

// One color per bucket, keyed by a hash of the name -- same person always
// gets the same color, spread across enough buckets that two athletes in
// the same list rarely collide. Deliberately soft (tinted background +
// ring, not a solid fill) to sit quietly next to the rest of the app's
// dark surfaces rather than competing with it.
const AVATAR_COLORS = [
  "bg-primary/20 text-primary ring-primary/30",
  "bg-blue-500/20 text-blue-400 ring-blue-500/30",
  "bg-purple-500/20 text-purple-400 ring-purple-500/30",
  "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30",
  "bg-amber-500/20 text-amber-400 ring-amber-500/30",
  "bg-pink-500/20 text-pink-400 ring-pink-500/30",
  "bg-teal-500/20 text-teal-400 ring-teal-500/30",
  "bg-rose-500/20 text-rose-400 ring-rose-500/30",
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

// Ring treatment for a real streak milestone, indexed in the same order as
// STREAK_TIERS (imported from streak-badge.tsx so the two never disagree
// about where a tier starts). Each step is a strictly thicker/hotter ring
// than the last -- ring-2 in place of the resting ring-1, climbing from a
// faint primary tint to the full-strength brand color -- so the badge and
// the avatar tell the same story about how far along a streak someone is.
// The top tier (20+) additionally gets a slow pulse (paused for
// prefers-reduced-motion via motion-safe:) reusing rest-timer's
// rest-heartbeat keyframe, since an avatar this hot deserves to actually
// move, not just sit brighter than its neighbors.
const STREAK_RING_CLASSES = [
  "ring-2 ring-primary motion-safe:animate-[rest-heartbeat_2.4s_ease-in-out_infinite]",
  "ring-2 ring-primary/70",
  "ring-2 ring-primary/45",
  "ring-2 ring-primary/25",
];

function streakRingFor(currentStreak: number | undefined): string | undefined {
  if (!currentStreak) return undefined;
  const tierIndex = STREAK_TIERS.findIndex((t) => currentStreak >= t);
  return tierIndex === -1 ? undefined : STREAK_RING_CLASSES[tierIndex];
}

/** Initials-only identity badge -- deliberately never a photo upload. The
 * roster includes underage athletes, so a real profile-photo feature isn't
 * appropriate here; this gives every name in a list something more than
 * plain text to identify itself by, without that risk.
 *
 * `currentStreak` is optional and purely cosmetic: pass it wherever the
 * caller already has it (e.g. a roster/leaderboard row) and an athlete who
 * has hit a real STREAK_TIERS threshold gets a stronger ring so they stand
 * out in a list; omit it (or stay under the lowest tier) and the avatar
 * renders exactly as it always has. */
export function AthleteAvatar({
  name,
  size = "md",
  currentStreak,
}: {
  name: string;
  size?: "sm" | "md";
  currentStreak?: number;
}) {
  const dims = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display font-bold ring-1",
        dims,
        colorFor(name),
        streakRingFor(currentStreak),
      )}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}
