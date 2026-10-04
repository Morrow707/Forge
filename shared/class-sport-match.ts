/** Does a class belong to an athlete's sport? (2026-10-04, Scott: sort the catalog by the
 * athlete's sport first, labelled "For your sport".) A class carries a free-text category
 * ("Pitching", "Basketball"); an athlete carries a free-text sport from the SPORTS
 * suggestions ("Baseball", "Track & Field"). Both are compared lowercased, and the table
 * below carries the categories a sport reaches that do not share its name. A miss here only
 * costs a class its label, never its place in the catalog. */
const SPORT_CATEGORY_ALIASES: Record<string, string[]> = {
  baseball: ["pitching", "hitting", "baseball"],
  softball: ["pitching", "hitting", "softball"],
  "track & field": ["track", "sprinting", "track & field", "track and field"],
  "cross country": ["track", "running", "cross country"],
  football: ["football", "receiving"],
  basketball: ["basketball", "shooting"],
  soccer: ["soccer", "football (soccer)"],
  volleyball: ["volleyball"],
  wrestling: ["wrestling"],
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function classCategoryMatchesSport(category: string | null | undefined, sport: string | null | undefined): boolean {
  const c = norm(category);
  const s = norm(sport);
  if (!c || !s) return false;
  if (c === s) return true;
  const aliases = SPORT_CATEGORY_ALIASES[s] ?? [];
  return aliases.includes(c) || c.includes(s) || s.includes(c);
}
