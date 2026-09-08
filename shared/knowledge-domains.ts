/**
 * The closed list of subject areas a knowledge source or passage can belong
 * to, and therefore which assistants can retrieve it.
 *
 * One shared list because it is used in four places that must agree: the
 * upload form, the per-passage tagger, the retrieval filter, and the
 * conflict detector's neighbour search. It lived only in the admin screen's
 * own constant, which meant a domain added there was silently unknown
 * everywhere else.
 *
 * Keep it short. These are the shelves in the library, not a taxonomy of
 * sports science -- a list long enough to need scrolling is a list an admin
 * ticks wrongly, and a passage filed under a shelf nobody searches is a
 * passage that does not exist.
 */
export const KNOWLEDGE_DOMAINS = [
  { key: "strength", label: "Strength & conditioning" },
  { key: "nutrition", label: "Nutrition" },
  { key: "rehab", label: "Rehab & return to play" },
  { key: "sport", label: "Sport specific" },
  { key: "movement", label: "Movement & camera" },
  { key: "class", label: "Class & lesson design" },
] as const;

export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number]["key"];

export const KNOWLEDGE_DOMAIN_KEYS = KNOWLEDGE_DOMAINS.map((d) => d.key) as KnowledgeDomain[];

export function isKnowledgeDomain(value: string): value is KnowledgeDomain {
  return (KNOWLEDGE_DOMAIN_KEYS as string[]).includes(value);
}

export function knowledgeDomainLabel(key: string): string {
  return KNOWLEDGE_DOMAINS.find((d) => d.key === key)?.label ?? key;
}
