// npm audit with an allowlist for advisories that have no fix.
//
// `npm audit` has no way to say "known, unfixable, reviewed". On 2026-10-03 a new advisory on
// `braces` (GHSA-vfj7-8cjw-p6xm, reachable only through tailwindcss, "No fix available") turned
// CI red on a commit that changed a markdown file, and the only way back to green was to stop
// auditing. This keeps the audit: every advisory in scripts/npm-audit-allowlist.json carries a
// reason and an expiry, an expired entry fails the build again, and a vulnerability the list does
// not name fails exactly as before. The server-error retry (scripts/npm-audit-retry.sh) still
// works because npm's own error line is printed through.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const allowlist = JSON.parse(readFileSync(path.join(here, "npm-audit-allowlist.json"), "utf8"));
const args = process.argv.slice(2);
const levelArg = args.find((a) => a.startsWith("--audit-level="));
const level = levelArg ? levelArg.split("=")[1] : "low";
const rank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

const run = spawnSync("npm", ["audit", "--json", ...args.filter((a) => !a.startsWith("--audit-level="))], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  process.exit(run.status ?? 1);
}
if (report.error) {
  // Same line npm prints without --json, so the retry script recognises a server failure.
  console.error(`npm error audit endpoint returned an error: ${JSON.stringify(report.error)}`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const allowed = new Map();
for (const entry of allowlist) {
  if (entry.expires < today) {
    console.error(`Audit allowlist entry for ${entry.advisory} expired on ${entry.expires}: re-check whether a fix exists, then extend or remove it.`);
    process.exit(1);
  }
  allowed.set(entry.advisory, entry);
}

const vulns = report.vulnerabilities ?? {};
// A package is covered when every advisory reaching it is allowlisted, directly or through
// another covered package. Iterate to a fixed point because `via` can name packages.
const covered = new Set();
let changed = true;
while (changed) {
  changed = false;
  for (const [name, v] of Object.entries(vulns)) {
    if (covered.has(name)) continue;
    const ok = v.via.every((via) => (typeof via === "string" ? covered.has(via) : allowed.has(via.url)));
    if (ok && v.via.length > 0) {
      covered.add(name);
      changed = true;
    }
  }
}

const failing = Object.entries(vulns).filter(([name, v]) => !covered.has(name) && (rank[v.severity] ?? 0) >= (rank[level] ?? 0));
for (const name of covered) {
  const v = vulns[name];
  const urls = v.via.filter((x) => typeof x !== "string").map((x) => x.url);
  console.log(`allowlisted: ${name} (${v.severity}) ${urls.join(" ")}`.trim());
}
if (failing.length === 0) {
  console.log(`npm audit: ${Object.keys(vulns).length - covered.size} vulnerabilities at or above ${level} after the allowlist.`);
  process.exit(0);
}
console.log(`# npm audit report (allowlist applied)\n`);
for (const [name, v] of failing) {
  console.log(`${name}  ${v.range}\nSeverity: ${v.severity}`);
  for (const via of v.via) console.log(typeof via === "string" ? `  via ${via}` : `  ${via.title} - ${via.url}`);
  console.log(v.fixAvailable ? "Fix available" : "No fix available", "\n");
}
console.log(`${failing.length} vulnerabilities at or above ${level}`);
process.exit(1);
