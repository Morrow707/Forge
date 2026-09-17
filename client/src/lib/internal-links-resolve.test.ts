import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** Every internal link in the app has to land on a route that exists.
 *
 * The one that prompted this: the waiver review queue linked an athlete's "account" to
 * /admin/users/:id, and there is no such route -- only /admin/users, which finds a user by
 * searching. An admin deciding whether a signed document is about the right child clicked
 * through to the 404 page. Nothing caught it, because a href is just a string until somebody
 * taps it, and nobody taps every link.
 *
 * SCANS, NEVER HOLDS A LIST -- same reasoning as refused-capture-survives.test.ts. A list would
 * have to be kept in step with 104 routes and every screen that links to one, and the next dead
 * link will be in a file nobody thought to add.
 *
 * It only checks links it can resolve statically: a literal path, or a template whose
 * interpolations are whole path segments (/coach/my/day/${a}/${b} matches
 * /coach/my/day/:assignmentId/:programDayId). A href built by concatenation or handed down as a
 * variable is invisible here, so this is a floor, not a proof.
 */

const ROOT = path.join(process.cwd(), "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const app = fs.readFileSync(path.join(ROOT, "App.tsx"), "utf8");
const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);

const routeMatchers = routes.map(
  (r) =>
    new RegExp(
      "^" +
        r
          // :id, :date?, etc. -- one path segment each, which is what wouter matches.
          .replace(/:[A-Za-z0-9_]+\??/g, "[^/]+")
          .replace(/\*/g, ".*") +
        "$",
    ),
);

// One string or template literal that starts with "/", after any of the props/calls that
// actually navigate. `\w*[Hh]ref` catches the pass-down props too (programsHref, classesHref,
// ...), which is how most of the nav in this app is wired.
const LITERAL = String.raw`(?:"(\/[^"]*)"|'(\/[^']*)'|\`(\/[^\`]*)\`)`;
const NAVIGATIONS = [
  String.raw`\w*[Hh]ref=\{?\s*`,
  String.raw`setLocation\(\s*`,
  String.raw`navigate\(\s*`,
  String.raw`<Redirect\s+to=\{?\s*`,
  String.raw`\bto=\{?\s*`,
].map((prefix) => new RegExp(prefix + LITERAL, "g"));

type Link = { target: string; where: string };

function collectLinks(): Link[] {
  const found: Link[] = [];
  for (const file of walk(ROOT)) {
    if (file.endsWith(path.join("src", "App.tsx"))) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const matcher of NAVIGATIONS) {
      for (const m of src.matchAll(matcher)) {
        const raw = m[1] ?? m[2] ?? m[3];
        let target = raw.split("?")[0].split("#")[0];
        // /api/... is a fetch, not navigation. // is protocol-relative, i.e. external.
        if (target.startsWith("/api") || target.startsWith("//")) continue;
        if (target.length > 1 && target.endsWith("/")) target = target.slice(0, -1);
        // An interpolation is one segment's worth of value; what it resolves to at runtime
        // cannot be known here, so it stands in as any single segment.
        const resolved = target.replace(/\$\{[^}]*\}/g, "X");
        if (resolved.includes("${")) continue;
        const line = src.slice(0, m.index).split("\n").length;
        found.push({
          target: resolved,
          where: `${path.relative(process.cwd(), file)}:${line}`,
        });
      }
    }
  }
  return found;
}

describe("internal links", () => {
  const links = collectLinks();

  it("finds the routes and the links to check them against", () => {
    // If either side ever reads zero, this file is silently passing on nothing at all -- which
    // is the failure mode of a scan-based test and worth asserting out loud.
    expect(routes.length).toBeGreaterThan(50);
    expect(links.length).toBeGreaterThan(20);
  });

  it("every one of them resolves to a declared route", () => {
    const dead = links
      .filter((l) => !routeMatchers.some((re) => re.test(l.target)))
      .map((l) => `${l.target}  <-  ${l.where}`);
    expect(dead).toEqual([]);
  });
});
