# Dependency overrides

`package.json` cannot hold comments, and an override with no stated reason is
the kind of thing that gets tidied away by someone doing housekeeping, which
silently reinstates whatever it was pinned to avoid. So the reasons live here.

Re-check this file whenever `npm audit` is clean but an override looks
pointless: "pointless" is what a working override looks like.

## `xcode` → `uuid: ^11.1.1`

`xcode@3.0.1` asks for `uuid@^7.0.3`, and every `uuid` below 11.1.1 is missing
a buffer bounds check in v3/v5/v6 when a caller supplies its own buffer
(GHSA-w5hq-g745-h8pq). `xcode` is not published often enough to wait for, and
it reaches us through `@capacitor/cli`, so it is on the path of every iOS
build.

Safe to force because `xcode` uses exactly one thing from the package:
`uuid.v4()` with no arguments, in `generateUuid()`. The vulnerable code path is
the one that fills a caller-supplied buffer, which it never touches. Verified
after the bump by parsing the real `ios/App/App.xcodeproj/project.pbxproj` and
generating ids: 24-character uppercase hex, all distinct, and `npx cap sync
ios` completes and finds all 17 plugins.

Drop the override once `xcode` ships a release depending on `uuid@>=11.1.1`.

## `@esbuild-kit/core-utils` → `esbuild: ^0.25.12`

`drizzle-kit` depends on `@esbuild-kit/esm-loader`, which pins
`esbuild@0.18.20`. Every esbuild at or below 0.24.2 lets any website send
requests to the development server and read the response
(GHSA-67mh-4wv8-2f99).

`@esbuild-kit/*` is deprecated -- it was merged into `tsx`, which we already
depend on separately -- so no fix is coming from upstream, and `drizzle-kit`
still lists it. npm's own suggested remedy was a downgrade to `drizzle-kit`
0.18.1, which is several major versions back and not a trade worth making for
a dev-server advisory.

Forcing it up rather than down keeps `drizzle-kit` current. It lands on the
same 0.25.12 that `drizzle-kit` and `vite` already resolve for their own direct
`esbuild` dependency, so this narrows the tree rather than widening it. Verified
with `drizzle-kit --version` and a full `npm run build`.

Drop the override once `drizzle-kit` stops depending on `@esbuild-kit/*`.

## Why `@capacitor/assets` is not a dependency

It was removed rather than patched. It is a one-off tool for generating app
icons and splash screens from a source image, and it pulled in most of the
repository's vulnerability count by itself: an old `@capacitor/cli@5.7.8` whose
`tar@6.2.1` carried three path-traversal advisories, `sharp@0.32.6` with
inherited libvips and libheif CVEs, and `@trapezedev/project`. All were
unfixable in place -- `@capacitor/assets@3.0.5` is the latest release and still
depends on all of them.

Nothing invoked it: no npm script, no workflow step, and no `assets/` or
`resources/` directory holding a source icon for it to read, so it could not
have run even if something had tried. Removing it took 123 packages out of the
tree.

If app icons ever do need regenerating, `npx @capacitor/assets generate` fetches
it on demand without putting any of that back in the lockfile.
