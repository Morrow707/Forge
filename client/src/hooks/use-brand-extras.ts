import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { applyBrandTerms, brandTerm, type BrandExtras, type BrandTermKey } from "@shared/brand-extras";

/** The program's own personalization (shared/brand-extras.ts) as the signed-in person's app wears
 *  it, already narrowed to what the program's plan allows. Shares AppShell's /api/branding/me
 *  query, so it costs no extra request. Empty until the answer arrives: Forge's own words and
 *  look show until then, never a guess. */
export function useBrandExtras() {
  const { user } = useAuth();
  const { data } = useQuery<{ brandExtras?: BrandExtras | null }>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const extras = data?.brandExtras ?? null;
  return {
    extras,
    /** A Forge word in the program's words: term("program") -> "Block". */
    term: (key: BrandTermKey, plural = false) => brandTerm(extras, key, plural),
    /** Every Forge term inside a label, swapped: "Mark Workout Complete" -> "Mark Session Complete". */
    words: (text: string) => applyBrandTerms(text, extras),
  };
}

/** The program's greeting for a first name: "{name}" is replaced, and a greeting without it is
 *  followed by the name ("Let's work" -> "Let's work, Jordan"). Forge's own when none is set. */
export function brandGreeting(extras: BrandExtras | null, firstName: string, fallback: string): string {
  const custom = extras?.wording?.greeting?.trim();
  if (!custom) return fallback;
  return custom.includes("{name}") ? custom.split("{name}").join(firstName) : `${custom}, ${firstName}`;
}
