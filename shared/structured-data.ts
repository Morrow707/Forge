/** JSON-LD for the public pages.
 *
 * Two things a search engine can use and nothing it cannot verify. The Organization is what puts
 * the name, logo and contact address in a knowledge panel; the SoftwareApplication is what lets a
 * result carry the platform and the price. Prices are READ from the tier constants -- a schema
 * that says $9.99 while the pricing page says $4.99 is a rich result that misleads, and it would
 * drift the first time somebody changed one and not the other.
 *
 * WHAT IS DELIBERATELY ABSENT. No aggregateRating or review: Forge has none, and an invented one
 * is a manual action from Google as well as a lie. No sameAs: there are no social profiles to
 * point at (shared/contact.ts is the whole of what Forge publishes). No claim about measurement
 * accuracy anywhere -- schema.org has no field for it and the honest statement lives in
 * shared/camera-accuracy-copy.ts, on the page, where a buyer reads it. A FAQPage is not emitted
 * because no public page has an FAQ; adding the schema without the visible questions is exactly
 * the kind of markup Google penalises.
 */
import { PUBLIC_ROUTES, type PublicRoute } from "./public-routes";
import { FREE_AGENT_TIERS, FREE_AGENT_TIER_ORDER } from "./free-agent-tiers";
import { BILLING_TIERS, ORG_PER_ATHLETE_CENTS } from "./billing-tiers";
import { FORGE_CONTACT_EMAIL, FORGE_LEGAL_ENTITY, FORGE_POSTAL_ADDRESS } from "./contact";
import { MOVEMENTS } from "./movement-library";

export const SITE_NAME = "Forge Performance Systems";
export const LOGO_PATH = "/icon-512.png";

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function organizationJsonLd(origin: string) {
  const base = origin.replace(/\/$/, "");
  // "5145 North 7th Street, D-237, Phoenix, Arizona 85014" -- split on the commas rather than
  // restated, so the address here cannot disagree with the one on the legal documents.
  const [street, unit, locality, regionAndPostal] = FORGE_POSTAL_ADDRESS.split(",").map((s) => s.trim());
  const [region, postalCode] = regionAndPostal.split(/\s+(?=\d)/);
  return {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: SITE_NAME,
    legalName: FORGE_LEGAL_ENTITY,
    url: `${base}/`,
    logo: `${base}${LOGO_PATH}`,
    email: FORGE_CONTACT_EMAIL,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${street}, ${unit}`,
      addressLocality: locality,
      addressRegion: region,
      postalCode,
      addressCountry: "US",
    },
  };
}

export function softwareApplicationJsonLd(origin: string) {
  const base = origin.replace(/\/$/, "");
  const smallest = BILLING_TIERS[Object.keys(BILLING_TIERS)[0] as keyof typeof BILLING_TIERS];
  const offers = [
    ...FREE_AGENT_TIER_ORDER.map((id) => {
      const t = FREE_AGENT_TIERS[id];
      return {
        "@type": "Offer",
        name: `${t.label} (individual athlete)`,
        description: t.description,
        price: dollars(t.monthlyPriceCents),
        priceCurrency: "USD",
        // A monthly subscription, said as schema.org says it.
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: dollars(t.monthlyPriceCents),
          priceCurrency: "USD",
          billingDuration: 1,
          billingIncrement: 1,
          unitCode: "MON",
        },
      };
    }),
    {
      "@type": "Offer",
      name: "School or club program (per athlete)",
      description: `$${dollars(ORG_PER_ATHLETE_CENTS)} per athlete per month, in roster bands. The smallest band, ${smallest.label}, is $${dollars(smallest.monthlyPriceCents)} a month.`,
      price: dollars(ORG_PER_ATHLETE_CENTS),
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: dollars(ORG_PER_ATHLETE_CENTS),
        priceCurrency: "USD",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "athlete per month" },
      },
    },
  ];
  return {
    "@type": "SoftwareApplication",
    "@id": `${base}/#app`,
    name: SITE_NAME,
    url: `${base}/`,
    applicationCategory: "SportsApplication",
    applicationSubCategory: "Strength and conditioning coaching",
    operatingSystem: "iOS, Web",
    publisher: { "@id": `${base}/#organization` },
    offers,
  };
}

export function websiteJsonLd(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: SITE_NAME,
    url: `${base}/`,
    publisher: { "@id": `${base}/#organization` },
  };
}

function breadcrumbJsonLd(origin: string, route: PublicRoute) {
  const base = origin.replace(/\/$/, "");
  const segments = route.path.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const items = [{ name: "Home", path: "/" }];
  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    const known = PUBLIC_ROUTES.find((r) => r.path === acc);
    items.push({ name: known?.title ?? seg, path: acc });
  }
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${base}${it.path}`,
    })),
  };
}

/** The graph for one route. Organization, WebSite and the application on every page (they are
 * small, and Google reads the whole site for an entity, not one URL), a WebPage naming this
 * route, a breadcrumb for nested paths, and for a movement page an HowTo-free Article -- a
 * filming guide is not a recipe, and HowTo rich results were retired in 2023. */
export function jsonLdForRoute(origin: string, route: PublicRoute, imageAbsolute: string) {
  const base = origin.replace(/\/$/, "");
  const graph: Record<string, unknown>[] = [
    organizationJsonLd(origin),
    websiteJsonLd(origin),
    softwareApplicationJsonLd(origin),
    {
      "@type": "WebPage",
      "@id": `${base}${route.path}`,
      url: `${base}${route.path}`,
      name: route.title,
      description: route.description,
      isPartOf: { "@id": `${base}/#website` },
      primaryImageOfPage: imageAbsolute,
      inLanguage: "en",
    },
  ];
  const crumbs = breadcrumbJsonLd(origin, route);
  if (crumbs) graph.push(crumbs);
  const movement = MOVEMENTS.find((m) => `/movements/${m.slug}` === route.path);
  if (movement) {
    graph.push({
      "@type": "Article",
      headline: route.title,
      about: movement.name,
      description: route.description,
      mainEntityOfPage: `${base}${route.path}`,
      publisher: { "@id": `${base}/#organization` },
      image: imageAbsolute,
      inLanguage: "en",
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
