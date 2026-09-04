# Test coverage: what is covered, what is not, and why

Written by the test-coverage session of the database-audit effort
(branch `claude/audit-test-coverage`). The point of this file is that the
gaps below are deliberate and each has a reason, so the next person to
look does not have to re-derive which ones are "nobody got to it" and
which ones are "this cannot be done from here."

## The constraint that shapes all of it

There is no Postgres in the sessions this work runs in. `server/db.ts`
throws at import time when `DATABASE_URL` is unset, and it is unset. So a
module is testable here only if it is reachable without that import, which
means one of three things:

- a pure function, or a `shared/` constant table,
- a Zod schema (`shared/schema.ts` imports drizzle's pg-core for table
  definitions, but never opens a connection),
- a `server/` module whose storage import can be replaced with
  `vi.mock("./storage", ...)` before it loads.

`server/billing.test.ts` established the third pattern and
`vitest.config.ts` documents it. Everything below sorts by which of those
a module falls into.

## Covered

| Area | File | What it pins down |
|---|---|---|
| SSRF guard | `server/safe-fetch.test.ts` | Scheme allowlist, every blocked IPv4 and IPv6 range, IPv4-mapped addresses, DNS-rebinding socket pinning, per-hop redirect re-validation, HTML stripping and entity-unescape order |
| Signed media URLs | `server/media-url-signing.test.ts` | Gated vs public directories, expiry, tampering, truncated and non-hex signatures, re-signing, the deep response sweep |
| Age-based privacy tiering | `shared/privacy-tiers.test.ts` | 13th and 18th birthday boundaries both directions, leap-day birthdays, retention window per tier |
| Session tracking | `server/session-tracking.test.ts` | `normalizeIp`, `formatDeviceLabel`, the `shouldTouchLastSeen` throttle and its eviction path, `resolveLocation` failure modes |
| Workout-log input caps | `shared/schema-caps.test.ts` | Every `.max()` on `setLogInputSchema` at, one under, and one over its bound; the nested entries-times-sets multiplication; `submitWellnessCheckinSchema`'s optional date regex and every numeric range |
| Pure shared logic | `shared/{wellness,load,force-velocity,plates,achievements,injury-matching,video-retention,testing-metrics}.test.ts` | Readiness scoring and its thresholds, ACWR bands and the rolling windows, the load-velocity fit and its refusal cases, plate math and warmup ramps, the trophy ladder, pain-to-exercise matching, retention cap invariants, metric lookups |

`safe-fetch` mocks `node:dns` and `node:http(s)` rather than storage, since
what it reaches is the network, not the database.

## Not covered, and why

### Needs a database — cannot be done from these sessions

**`server/storage.ts`, 21,072 lines.** The single largest untested surface
in the repo and the one the database audit was about. Nearly every export
is a query. Mocking the Drizzle query builder well enough to make an
assertion meaningful would mean reimplementing enough of Postgres that the
test would be asserting against the mock, not against the code. What this
actually needs is an integration suite against a real throwaway Postgres,
which is a CI and environment change, not a test-file change.

**`server/routes.ts`, 8,497 lines.** Same reason one level up: it imports
storage, so it inherits the same import-time failure, and its handlers are
mostly orchestration over storage calls. The parts worth testing in
isolation are the input schemas, and those already live in
`shared/schema.ts`, which is covered above. Route-level behaviour
(authorization, the media-signing sweep, rate limiting) wants supertest
against an app instance with storage mocked — feasible, but a different
shape of work than this session owned.

**Jobs.** `data-retention-job.ts`, `video-retention-job.ts`,
`reflection-job.ts`. Each is a scheduled pass over storage. Their decision
logic is thin and their storage coupling is thick.

**`server/seed.ts`, `server/reconcile-schema.ts`.** Both exist to write to
a real database.

### Reachable with mocked storage — genuinely untested, worth doing

These are the best remaining return per unit of effort. All follow the
`billing.test.ts` pattern; none were in this session's scope.

- **Export builders**: `training-history-export.ts` (CSV escaping in
  `csvField` is pure and security-adjacent), `cara-export.ts`,
  `compliance-report.ts`, `recruiting-profile.ts`,
  `movement-screen-export.ts`, `legal-document-export.ts`,
  `progress-report.ts`. Data in, document out.
- **Auth surface**: `auth-utils.ts` and `mfa.ts` first, since token and
  code handling is security-critical and largely pure.
- **`csrf-protection.ts`** and **`rate-limiters.ts`**: policy decisions
  over a request object, no storage needed.
- **`uploaded-files.ts`**: path handling under an uploads root, which is
  exactly the kind of thing the traversal defect below is about.
- **`pricing-catalog.ts`**, **`apple-iap.ts`**, **`food-lookup.ts`**,
  **`ics.ts`**, **`notify.ts`**.
- **Email builders**: several small modules that render a string.

### Pure shared modules still untested

Not in scope for this session, none security-critical, all trivially
testable: `billing-tiers`, `coach-sections`, `color-contrast`,
`dashboard-widgets`, `exercise-family`, `exercise-taxonomy`,
`fault-correctives`, `free-agent-tiers`, `goniometer`, `movement-screen`,
`muscle-map`, `notification-categories`, `roster-groups`,
`skill-fault-thresholds`, `team-features`.

### Client

`client/src` has no tests at all. `vitest.config.ts` here is deliberately
Node-environment and scoped to `server/**` and `shared/**`; a browser-side
suite needs its own jsdom config rooted at `client/`, which is a separate
decision.

## Defects found, not fixed here

Both are marked `.skip` with the explanation inline. They were left unfixed
because three other sessions were editing those files concurrently and
ownership had to stay clean.

1. **`verifyMediaUrl` does not normalize the path before deciding whether
   it is gated.** The function opens with "if this is not a gated path,
   allow it", and `isGatedUploadPath` matches only the exact
   one-directory-deep shape. A path with an extra segment therefore falls
   through as public — including one whose extra segment is a traversal
   resolving back into a gated directory. Not exploitable today:
   `express.static` is mounted after this middleware in `routes.ts` and
   serve-static rejects a decoded path containing `..`. But the gate is
   being held shut by a dependency rather than by its own check.
   Test: `server/media-url-signing.test.ts`, "refuses a signed path walked
   out of its gated directory".

2. **`PRIVATE_IP_PATTERNS` in `session-tracking.ts` misses three ranges
   `safe-fetch.ts` blocks**: `169.254.0.0/16` (link-local, and the cloud
   metadata address with it), `100.64.0.0/10` (carrier-grade NAT), and the
   `fd00::/8` half of unique-local, because the pattern is `/^fc00:/`
   rather than `/^f[cd]/`. Consequence is bounded but real: those
   addresses reach ipapi.co as outbound requests instead of
   short-circuiting, leaking an internal address to a third party for a
   lookup that can only answer "unknown".
   Test: `server/session-tracking.test.ts`, "skips the lookup for
   link-local, CGNAT, and fd00:: addresses too".

## Running it

```
npx vitest run
npx tsc --noEmit
```

`tsconfig.json` includes `server` and `shared`, so the type check covers
the test files too.
