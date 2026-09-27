import { describe, it, expect } from "vitest";
import { buildStoredZip } from "./zip-store";

/** Written rather than installed, so it has to be proven rather than trusted. A zip that an
 *  unarchiver refuses is a silent loss of somebody's afternoon. */
describe("the stored zip", () => {
  async function bytesOf(blob: Blob) {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer).getUint32(o, true);
  const u16 = (b: Uint8Array, o: number) => new DataView(b.buffer).getUint16(o, true);

  it("writes the three signatures a reader looks for", async () => {
    const b = await bytesOf(
      buildStoredZip([{ name: "a.txt", bytes: new TextEncoder().encode("hello") }]),
    );
    expect(u32(b, 0)).toBe(0x04034b50); // local file header
    // End of central directory is the last 22 bytes when there is no comment.
    expect(u32(b, b.length - 22)).toBe(0x06054b50);
    const centralOffset = u32(b, b.length - 22 + 16);
    expect(u32(b, centralOffset)).toBe(0x02014b50); // central directory header
  });

  it("stores rather than compresses, and reports both sizes the same", async () => {
    const payload = new TextEncoder().encode("hello world");
    const b = await bytesOf(buildStoredZip([{ name: "a.txt", bytes: payload }]));
    expect(u16(b, 8)).toBe(0); // method 0
    expect(u32(b, 18)).toBe(payload.length); // compressed size
    expect(u32(b, 22)).toBe(payload.length); // uncompressed size
  });

  it("round-trips the payload bytes verbatim", async () => {
    const payload = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x42]);
    const b = await bytesOf(buildStoredZip([{ name: "f.jpg", bytes: payload }]));
    const nameLen = u16(b, 26);
    const start = 30 + nameLen;
    expect(Array.from(b.slice(start, start + payload.length))).toEqual(Array.from(payload));
  });

  it("counts every entry in both places the format asks for", async () => {
    const entries = [1, 2, 3].map((n) => ({
      name: `f${n}.jpg`,
      bytes: new Uint8Array([n]),
    }));
    const b = await bytesOf(buildStoredZip(entries));
    const eocd = b.length - 22;
    expect(u16(b, eocd + 8)).toBe(3); // entries on this disk
    expect(u16(b, eocd + 10)).toBe(3); // entries total
  });

  it("points each central record at its own local header", async () => {
    const entries = [
      { name: "a.jpg", bytes: new Uint8Array(10) },
      { name: "b.jpg", bytes: new Uint8Array(20) },
    ];
    const b = await bytesOf(buildStoredZip(entries));
    const centralOffset = u32(b, b.length - 22 + 16);
    // Second central record sits after the first (46 + name length).
    const secondCentral = centralOffset + 46 + "a.jpg".length;
    const secondLocal = u32(b, secondCentral + 42);
    expect(u32(b, secondLocal)).toBe(0x04034b50);
    // ...and that local header is the one naming b.jpg.
    const nameLen = u16(b, secondLocal + 26);
    expect(new TextDecoder().decode(b.slice(secondLocal + 30, secondLocal + 30 + nameLen))).toBe(
      "b.jpg",
    );
  });

  it("makes an empty zip that is still a zip", async () => {
    const b = await bytesOf(buildStoredZip([]));
    expect(b.length).toBe(22);
    expect(u32(b, 0)).toBe(0x06054b50);
  });
});
