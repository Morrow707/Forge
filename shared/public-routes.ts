/** EVERY ROUTE A LOGGED-OUT VISITOR CAN REACH, IN ONE LIST.
 *
 * Three things need to agree about this and used to derive it separately or not at all:
 *   - the sitemap, which tells Google what exists
 *   - the prerenderer, which writes a static HTML file per route so a crawler that does not run
 *     JavaScript still gets a title and a share card
 *   - robots.txt, which says what not to crawl
 *
 * Kept here rather than in client/ because the build scripts import it too, and a sitemap
 * generated from a second, hand-maintained list is a sitemap that goes stale the first time
 * somebody adds a page.
 *
 * PUBLIC IS NOT THE SAME AS INDEXABLE, and the distinction is the whole reason `index` exists.
 * /reset-password is reachable without a session -- it has to be, the visitor is locked out --
 * but it is a one-shot token landing page with nothing to rank and no reason to appear in a
 * search result. Same for the claim links, which arrive by email and belong to one athlete.
 * Those are public, listed here so nobody has to rediscover them, and marked index: false.
 */

import { MOVEMENTS } from "./movement-library";

export type PublicRoute = {
  path: string;
  title: string;
  description: string;
  /** In the sitemap and crawlable. False for a page that is reachable but has nothing to rank. */
  index: boolean;
  /** Relative sitemap priority. Only meaningful against the others in this list. */
  priority?: number;
  /** The share-card image. A PNG or JPG, never webp: Facebook, iMessage, Slack and LinkedIn all
   * read og:image and none of them will decode webp. The PAGE loads the webp sibling; the card
   * gets the PNG. */
  image?: string;
  /** An image that is on screen at first paint for THIS route and nothing else, preloaded from
   * the head so the browser starts fetching it before the JavaScript has even parsed. Only the
   * home page's hero qualifies; a preload for a below-the-fold image is pure cost. */
  preload?: string;
};

export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: "/",
    // The brand term is the whole title on the home page (fullTitle in page-meta.ts does not
    // append it again), so this is the one title that has to carry what Forge IS as well as
    // what it is called: "Forge Performance Systems" alone tells a search result nothing.
    title: "Forge Performance Systems: Strength & Conditioning Software",
    description:
      "Coaching software for strength and conditioning: build exercise libraries, program training blocks, and keep a whole roster's calendar in one place.",
    index: true,
    priority: 1.0,
    preload: "/marketing/shot-dashboard.webp",
  },
  {
    path: "/pricing",
    title: "Pricing",
    description:
      "What Forge costs for a school, a club or an individual athlete. Forge is in beta and is not charging yet.",
    index: true,
    priority: 0.9,
    image: "/marketing/shot-dashboard.png",
  },
  {
    path: "/for-high-schools",
    title: "For high schools and clubs",
    description:
      "Roster management, guardian consent for athletes under 18, and a privacy model built for minors from the start rather than bolted on.",
    index: true,
    priority: 0.9,
    image: "/marketing/shot-program-builder.png",
  },
  {
    path: "/for-athletes",
    title: "For athletes",
    description:
      "Your programming, your lift history and your own record of every session -- on the phone you already train with.",
    index: true,
    priority: 0.9,
    image: "/marketing/shot-trophies.png",
  },
  {
    path: "/camera-validation",
    title: "What the camera is tested on",
    description:
      "Which movements Forge's camera tracking has been validated on with real footage, which have not, and what a camera cannot measure from a given angle.",
    index: true,
    priority: 0.8,
    image: "/marketing/shot-analytics.png",
  },
  {
    path: "/movements",
    title: "Movement library",
    description:
      "How to film each movement Forge's camera tracking has been validated on, what it measures, and what is not reliable on each one.",
    index: true,
    priority: 0.8,
    image: "/marketing/shot-analytics.png",
  },
  {
    path: "/legal",
    title: "Legal documents",
    description: "Every agreement and policy that governs using Forge, in one place.",
    index: true,
    priority: 0.4,
  },
  {
    path: "/terms",
    title: "Terms of Use",
    description: "The agreement you accept when you create a Forge account, in full.",
    index: true,
    priority: 0.3,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description:
      "What Forge collects, where it is stored, how long it is kept, and the extra protections that apply to athletes under 18.",
    index: true,
    priority: 0.5,
  },
  {
    path: "/eula",
    title: "End User License Agreement",
    description: "The licence covering the Forge application software itself.",
    index: true,
    priority: 0.3,
  },
  {
    path: "/ai-terms",
    title: "AI Terms of Use",
    description: "How Forge's AI features work, what they are for, and what they must not be used for.",
    index: true,
    priority: 0.3,
  },
  {
    path: "/biometric-release",
    title: "Video and Biometric Consent",
    description:
      "What Forge records when an athlete films a set, what is derived from it, and what consent covers.",
    index: true,
    priority: 0.3,
  },
  {
    path: "/assumption-of-risk",
    title: "Assumption of Risk",
    description: "The acknowledgement every athlete makes about the risks of physical training.",
    index: true,
    priority: 0.3,
  },
  {
    path: "/research-consent",
    title: "Research Consent and Data Use",
    description:
      "What an athlete or guardian agrees to when they opt in to de-identified research use of training data, and how to withdraw.",
    index: true,
    priority: 0.3,
  },
  {
    path: "/delete-account",
    title: "Delete your account",
    description: "How to delete a Forge account and what happens to your data when you do.",
    index: true,
    priority: 0.3,
  },
  {
    path: "/login",
    title: "Sign in",
    description: "Sign in to Forge Performance Systems.",
    // Nothing to rank, and a sign-in form is not what somebody searching for Forge should land on.
    index: false,
  },
  {
    path: "/signup",
    title: "Create an account",
    description: "Create a Forge account.",
    // Deliberately not indexed while Forge is in closed beta: a signup page in search results
    // invites traffic the product cannot serve yet. Flip to true at public launch.
    index: false,
  },
  {
    path: "/forgot-password",
    title: "Reset your password",
    description: "Request a password reset link for your Forge account.",
    index: false,
  },
];

/** Reachable without a session but never crawlable: one-shot token landings and per-athlete
 * invite links. Matched by PREFIX because each carries a token or a code.
 *
 * /team/ is the deliberate exception and is not here -- see PublicTeamPage, it is the link a
 * coach puts on a flyer, so it is the one per-code page that SHOULD be indexed. It is absent
 * from PUBLIC_ROUTES only because its paths are not knowable at build time; the sitemap cannot
 * list them and the page carries its own metadata at runtime. */

/** The per-movement pages, appended rather than typed out: the movement list is the source of
 * truth for which exist, and writing them here again would be a second list to keep in step.
 * Four today, and more when the validation set grows. */
/** "Pendlay row" keeps its capital: it is somebody's name, and a search result that spells it
 * "pendlay" reads as a typo on the one page meant to rank for it. */
const inSentence = (name: string) => name.replace(/\b(?!Pendlay\b)([A-Z])/g, (c) => c.toLowerCase());
for (const m of MOVEMENTS) {
  PUBLIC_ROUTES.push({
    path: `/movements/${m.slug}`,
    title: `Filming a ${inSentence(m.name)}`,
    description: `Where to put the camera for a ${inSentence(m.name)}, what Forge measures from the footage, and what is not reliable on this movement.`,
    index: true,
    priority: 0.7,
    image: "/marketing/shot-analytics.png",
  });
}

export const NOINDEX_PREFIXES = [
  "/admin",
  "/claim",
  "/guardian/claim",
  "/reset-password",
  "/device-approval",
  "/verify-email",
  "/dev",
];

/** Every route that needs a session, by prefix. Not in NOINDEX_PREFIXES because those are the
 * PUBLIC pages that must not be indexed; these are not public at all. They matter to robots.txt
 * (a crawler that follows a footer link to /login and then /coach should be told not to bother)
 * and to the app shell, which carries noindex for anything under them.
 *
 * /api is not a client route, but a crawler that finds an API URL in a script and fetches it gets
 * JSON back with a 200, which is a page as far as it is concerned. */
export const AUTHED_PREFIXES = ["/api", "/coach", "/athlete", "/guardian", "/documents", "/admin"];

/** Every OTHER path the client router serves, by prefix, so the server can tell a real page from
 * a typo. Anything the router does not know renders the client's not-found page, which used to
 * arrive with a 200 -- a soft 404 that Google indexes as a page. The server cannot run the router,
 * so this is the list it checks instead. shared/public-routes-are-complete.test.ts reads the
 * router and fails if a route lands outside PUBLIC_ROUTES, these prefixes and NOINDEX_PREFIXES,
 * so the list cannot go stale without a test naming the path. */
export const APP_PREFIXES = ["/team", "/coach", "/athlete", "/guardian", "/admin", "/documents", "/dev"];

/** Whether the client has a page at this path (true), or would show its not-found page (false).
 * Exact for the public list and by prefix for the parameterised and session-gated areas. */
export function isKnownAppPath(path: string): boolean {
  const clean = path.length > 1 ? path.replace(/\/$/, "") : path;
  if (PUBLIC_ROUTES.some((r) => r.path === clean)) return true;
  const prefixes = [...APP_PREFIXES, ...NOINDEX_PREFIXES];
  return prefixes.some((p) => clean === p || clean.startsWith(`${p}/`));
}

export function isIndexable(path: string): boolean {
  if (NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  const known = PUBLIC_ROUTES.find((r) => r.path === path);
  return known ? known.index : false;
}
