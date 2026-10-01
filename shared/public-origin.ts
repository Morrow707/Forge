/** WHERE FORGE LIVES ON THE WEB, spelled once.
 *
 * Scott, 2026-10-01: the production domain is forgeperformancesystems.com, same app, pointed
 * at Render. Before this the Render hostname (forge-ebhd.onrender.com) was typed in four
 * places that cannot read an environment variable at runtime -- the native app's API base,
 * the iOS web-credentials entitlement, the Android Health Connect privacy URL -- and the
 * server built emailed links from RENDER_EXTERNAL_URL, which Render sets to the onrender
 * address even once a custom domain exists. public-origin.test.ts holds the plist, the
 * strings.xml and the native base to this constant, so the domain cannot move in one place
 * and not the others.
 *
 * Server-side the ORDER is PUBLIC_ORIGIN (set on Render once the domain is live) over
 * RENDER_EXTERNAL_URL over the request's own host; see server/public-origin.ts. The app shell
 * on a phone reads this constant, so the native build that carries it must not ship before
 * the domain answers. */
export const PUBLIC_ORIGIN = "https://forgeperformancesystems.com";
export const PUBLIC_HOST = "forgeperformancesystems.com";

/** The address Forge lived at through the beta. Kept in the iOS entitlement beside the new
 * domain so a password saved against it is still offered, and nowhere else. */
export const LEGACY_RENDER_HOST = "forge-ebhd.onrender.com";
