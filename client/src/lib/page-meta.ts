import { useEffect } from "react";

/** PER-ROUTE TITLE, DESCRIPTION AND SHARE CARD.
 *
 * Forge is a single-page app, so the document head is written once in index.html and then never
 * changes as somebody moves between routes. Every page therefore reported the same title --
 * "Forge Performance Systems -- Coach. Program. Perform." -- whether it was the pricing page, the
 * EULA or a team's public page. A browser tab, a bookmark, a shared link and a search result all
 * read that same one string.
 *
 * `usePageMeta` sets the head for the route that mounts it and restores the previous values when
 * that route unmounts, so a page that does NOT call it is not left wearing the last page's title.
 *
 * WHY THE SHARE CARD MATTERS MORE THAN THE SEARCH RESULT RIGHT NOW. Forge is in beta and is not
 * being found through Google -- it spreads by one coach sending another a link. Without og:* and
 * twitter:* tags that link renders in Messages, Slack and every social app as a bare URL: no
 * title, no image, no idea what was sent. That is the distribution path that actually exists
 * today, and it was the one with no metadata at all.
 *
 * ON PRERENDERING. scripts/prerender.mjs runs the real app for each public route and writes the
 * resulting head into a static HTML file, so a crawler that does not execute JavaScript still
 * sees these tags. That is why this module writes plain DOM meta tags rather than keeping the
 * values in React state: the prerenderer reads the document, not the component tree.
 */

export const SITE_NAME = "Forge Performance Systems";

/** The canonical origin, used to absolutize og:url and og:image.
 *
 * A share card's image URL must be absolute -- a relative path resolves against the SCRAPER's
 * host, not Forge's, so every card came back imageless. VITE_PUBLIC_ORIGIN lets a preview
 * deployment advertise itself correctly instead of pointing its cards at production. */
export const SITE_ORIGIN =
  (import.meta.env?.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, "") ||
  "https://forgeperformancesystems.com";

/** The default share image. Deliberately a screenshot of the product rather than a logo: the
 * card is usually the only thing a coach sees before deciding whether to tap. */
export const DEFAULT_SHARE_IMAGE = "/marketing/shot-dashboard.png";

export type PageMeta = {
  /** Page-specific part of the title. The site name is appended, never included here. */
  title: string;
  description: string;
  /** Path only, e.g. "/pricing". Absolutized against SITE_ORIGIN. */
  path?: string;
  image?: string;
  /** Keep this page out of search results. A page can be PUBLIC and still not belong in an
   * index -- see NOINDEX_PREFIXES in shared/public-routes.ts for which and why. */
  noindex?: boolean;
};

export function fullTitle(title: string): string {
  // The landing page passes the site name itself; everything else gets it appended, so the brand
  // term appears in every tab and every search result without being doubled on the home page.
  return title === SITE_NAME ? title : `${title} | ${SITE_NAME}`;
}

function setTag(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Writes the head. Exported separately from the hook so the prerenderer and tests can drive it
 * without mounting a component. */
export function applyPageMeta(meta: PageMeta) {
  const title = fullTitle(meta.title);
  const url = meta.path ? `${SITE_ORIGIN}${meta.path}` : SITE_ORIGIN;
  const image = `${SITE_ORIGIN}${meta.image ?? DEFAULT_SHARE_IMAGE}`;

  document.title = title;
  setTag('meta[name="description"]', "name", "description", meta.description);
  setLink("canonical", url);

  setTag('meta[property="og:title"]', "property", "og:title", title);
  setTag('meta[property="og:description"]', "property", "og:description", meta.description);
  setTag('meta[property="og:type"]', "property", "og:type", "website");
  setTag('meta[property="og:url"]', "property", "og:url", url);
  setTag('meta[property="og:image"]', "property", "og:image", image);
  setTag('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);

  // summary_large_image, not summary: the small variant crops to a square thumbnail, which turns
  // a screenshot of a dashboard into an unreadable smudge.
  setTag('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  setTag('meta[name="twitter:title"]', "name", "twitter:title", title);
  setTag('meta[name="twitter:description"]', "name", "twitter:description", meta.description);
  setTag('meta[name="twitter:image"]', "name", "twitter:image", image);

  // Present only when the page asks for it. Left in place by mistake, this tag silently removes a
  // page from Google, so it is removed rather than set to "index" when not wanted.
  const robots = document.head.querySelector('meta[name="robots"]');
  if (meta.noindex) {
    setTag('meta[name="robots"]', "name", "robots", "noindex, nofollow");
  } else if (robots) {
    robots.remove();
  }
}

/** React hook form. Applies on mount and on any change to the values, and restores whatever the
 * head held before when the route unmounts -- so a page that does not set its own metadata is
 * never left displaying the previous page's title. */
export function usePageMeta(meta: PageMeta) {
  const { title, description, path, image, noindex } = meta;
  useEffect(() => {
    const previousTitle = document.title;
    const previousDescription = document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute("content");
    applyPageMeta({ title, description, path, image, noindex });
    return () => {
      document.title = previousTitle;
      if (previousDescription != null) {
        setTag('meta[name="description"]', "name", "description", previousDescription);
      }
    };
  }, [title, description, path, image, noindex]);
}
