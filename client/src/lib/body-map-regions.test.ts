import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { MUSCLE_GROUPS } from "@shared/exercise-taxonomy";
import { SCORABLE_MUSCLE_GROUPS } from "@shared/strength-score";
import MANIFEST from "./body-map-manifest.json";

/**
 * THE FIGURE AND THE LIBRARY HAVE TO AGREE -- now a 3D render rather than SVG paths (2026-11-10).
 *
 * The body map is the Body Map artifact's tiles (client/public/body-map/) and their label maps,
 * where every pixel's value is the 1-based index of a muscle group in the manifest. These cases
 * hold the manifest, the label maps and the component to the same rules the SVG figure was held
 * to: every group a real muscleGroup, both views drawn, the scored groups on the figure, a
 * keyboard path to every group, and nothing attached to the head.
 */
type Tile = { w: number; h: number; groups: Record<string, { count: number; ax: number; ay: number }> };
const M = MANIFEST as unknown as { groups: string[]; tiles: Record<string, Tile> };
const KEYS = ["female-front", "female-back", "male-front", "male-back"] as const;
const MIN_GROUPS_PER_TILE = 10;
const MAX_UNDRAWN_SCORED = 2;
/** Crown to roughly the chin: the top tenth of every tile is the head. */
const HEAD_SHARE_OF_HEIGHT = 0.1;
const src = readFileSync(join(process.cwd(), "client/src/components/body-map.tsx"), "utf8");

/** An 8-bit greyscale, non-interlaced PNG (what tools/body-map writes), as rows of bytes. Read
 *  with zlib rather than a PNG package: one more dependency for one test is not worth it. */
const PNG_SIGNATURE_BYTES = 8;
const CHUNK_HEADER_BYTES = 8;
const CHUNK_CRC_BYTES = 4;
/** PNG row filters, in the order of the filter byte that names them. */
const FILTERS = ["none", "sub", "up", "average", "paeth"] as const;
const BYTE_MASK = 0xff;
/** The Paeth predictor: whichever of left, up and up-left is nearest left + up - up-left. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
function readGreyPng(path: string): { width: number; height: number; rows: Uint8Array[] } {
  const buf = readFileSync(path);
  const chunks: { type: string; data: Buffer }[] = [];
  const walk = (at: number): void => {
    if (at >= buf.length) return;
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + CHUNK_CRC_BYTES, at + CHUNK_HEADER_BYTES);
    chunks.push({ type, data: buf.subarray(at + CHUNK_HEADER_BYTES, at + CHUNK_HEADER_BYTES + len) });
    walk(at + CHUNK_HEADER_BYTES + len + CHUNK_CRC_BYTES);
  };
  walk(PNG_SIGNATURE_BYTES);
  const ihdr = chunks.find((c) => c.type === "IHDR")!.data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(CHUNK_CRC_BYTES);
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const stride = width + 1;
  const rows = Array.from({ length: height }).reduce<Uint8Array[]>((done, _, y) => {
    const filter = raw[y * stride];
    const line = raw.subarray(y * stride + 1, (y + 1) * stride);
    const prev = done[y - 1] ?? new Uint8Array(width);
    const out = new Uint8Array(width);
    line.forEach((v, x) => {
      const a = x > 0 ? out[x - 1] : 0;
      const b = prev[x];
      const c = x > 0 ? prev[x - 1] : 0;
      const predict = {
        none: 0,
        sub: a,
        up: b,
        average: (a + b) >> 1,
        paeth: paeth(a, b, c),
      }[FILTERS[filter] ?? "none"];
      out[x] = (v + predict) & BYTE_MASK;
    });
    return [...done, out];
  }, []);
  return { width, height, rows };
}
const labelMap = (key: string) => readGreyPng(join(process.cwd(), `client/public/body-map/lab3d/${key}.png`));

describe("the body map's regions", () => {
  it("names only real muscle groups", () => {
    const unknown = M.groups.filter((g) => !(MUSCLE_GROUPS as readonly string[]).includes(g));
    expect(unknown, "a group the library does not use").toEqual([]);
  });

  it("has all four tiles, front and back of both figures, each with groups on it", () => {
    KEYS.forEach((key) => {
      expect(M.tiles[key], key).toBeTruthy();
      expect(Object.keys(M.tiles[key].groups).length, key).toBeGreaterThan(MIN_GROUPS_PER_TILE);
    });
  });

  it("ships every tile and label map the manifest names, at the manifest's size", () => {
    KEYS.forEach((key) => {
      const lab = labelMap(key);
      expect([lab.width, lab.height], key).toEqual([M.tiles[key].w, M.tiles[key].h]);
      expect(readFileSync(join(process.cwd(), `client/public/body-map/img3d/${key}.webp`)).length, key).toBeGreaterThan(0);
    });
  });

  it("decodes the label maps exactly, or the head case below would pass on noise", () => {
    // Every labelled pixel is counted in the manifest, per group. Decoded and counted here, the
    // two must agree to the pixel -- a reader that mangled rows would not.
    KEYS.forEach((key) => {
      const lab = labelMap(key);
      const labelled = lab.rows.reduce((n, row) => n + row.filter((v) => v > 0).length, 0);
      const counted = Object.values(M.tiles[key].groups).reduce((n, g) => n + g.count, 0);
      expect(labelled, key).toBe(counted);
    });
  });

  it("covers what gets scored, and is honest about the rest", () => {
    expect(src).toContain("UNDRAWN_SCORABLE_GROUPS");
    const onFigure = new Set(KEYS.flatMap((k) => Object.keys(M.tiles[k].groups)));
    const missing = SCORABLE_MUSCLE_GROUPS.filter((g) => !onFigure.has(g));
    expect(missing.length, `undrawn: ${missing.join(", ")}`).toBeLessThanOrEqual(MAX_UNDRAWN_SCORED);
  });

  it("gives every group a keyboard path, and the label is a tap target", () => {
    // A canvas has no buttons of its own: the component draws real ones, over each label when
    // labelled and as a visually hidden list otherwise.
    expect(src).toContain('role="button"');
    expect(src).toContain("tabIndex={0}");
    expect(src).toContain("The label is a tap target too, not just the muscle.");
    expect(src).toContain('className="sr-only"');
  });

  // THE HEAD CARRIES NO MUSCLE GROUP. The head is the real head musculature now (Scott asked for
  // "the muscles in the face", 2026-11-08, and approved it 2026-11-10), but nothing on it is a
  // Forge group: no tap lands there, no score or set count can ever attach to a face. Read off the
  // label maps themselves. The neck and the traps reach up behind the jaw and are allowed.
  it("puts no muscle group on the head", () => {
    const allowed = new Set([0, M.groups.indexOf("Neck") + 1, M.groups.indexOf("Traps") + 1]);
    KEYS.forEach((key) => {
      const lab = labelMap(key);
      const headRows = lab.rows.slice(0, Math.round(lab.height * HEAD_SHARE_OF_HEIGHT));
      const onHead = headRows.reduce((n, row) => n + row.filter((v) => !allowed.has(v)).length, 0);
      expect(onHead, `${key}: a group drawn on the head`).toBe(0);
    });
  });

  it("never chooses the figure from the account", () => {
    // The figure is the viewer's own preference, kept in this browser -- never users.gender.
    expect(src).toContain("forge.bodyMap.figure");
    // Forbidden: any read of the account's gender or the signed-in user. Matches "user.gender",
    // "user?.gender", "useAuth", "/api/auth/me"; does not match "figure".
    // https://regex101.com/?regex=user%5C%3F%3F%5C.gender%7CuseAuth%7C%5C%2Fapi%5C%2Fauth%5C%2Fme&testString=user%3F.gender
    expect(src).not.toMatch(/user\??\.gender|useAuth|\/api\/auth\/me/);
  });

  it("carries the licence credit the anatomy asks for", () => {
    expect(src).toContain("Z-Anatomy (CC BY-SA 4.0)");
    expect(src).toContain("{BODY_MAP_CREDIT}");
  });
});
