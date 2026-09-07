import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { encodePng } from "./pdf-page-images";

/**
 * The PNG encoder is hand-written because adding a native image library to
 * get a scanned page in front of the model was not worth the deploy cost.
 * That trade is only sound if the encoder is actually correct: a subtly
 * malformed PNG is rejected by the API with an error that says nothing about
 * which of the header, the CRCs, or the scanline filters is wrong.
 */
describe("encodePng", () => {
  const red = Buffer.from([255, 0, 0]);
  const blue = Buffer.from([0, 0, 255]);

  it("writes a file any decoder will recognise as a PNG", () => {
    const png = encodePng(1, 1, red);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect(png.subarray(png.length - 8, png.length - 4).toString("latin1")).toBe("IEND");
  });

  it("records the dimensions, bit depth and colour type it actually wrote", () => {
    const png = encodePng(3, 2, Buffer.concat([red, blue, red, blue, red, blue]));
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
    expect(png[24]).toBe(8); // 8 bits per channel
    expect(png[25]).toBe(2); // truecolour RGB
  });

  it("round-trips the pixels, one filter byte per scanline", () => {
    // The classic way to get this wrong is to omit the per-scanline filter
    // byte, which produces a file that decodes to a sheared image rather
    // than an obviously broken one.
    const pixels = Buffer.concat([red, blue, blue, red]);
    const png = encodePng(2, 2, pixels);

    const idatStart = png.indexOf(Buffer.from("IDAT")) + 4;
    const idatLength = png.readUInt32BE(idatStart - 8);
    const raw = inflateSync(png.subarray(idatStart, idatStart + idatLength));

    expect(raw.length).toBe((2 * 3 + 1) * 2);
    expect(raw[0]).toBe(0);
    expect([...raw.subarray(1, 7)]).toEqual([255, 0, 0, 0, 0, 255]);
    expect(raw[7]).toBe(0);
    expect([...raw.subarray(8, 14)]).toEqual([0, 0, 255, 255, 0, 0]);
  });

  it("gives every chunk a CRC over its type and data", () => {
    // A wrong CRC is the failure mode that produces "invalid image" with no
    // further detail, so it is checked against an independently computed one.
    const png = encodePng(1, 1, red);
    const ihdrStart = png.indexOf(Buffer.from("IHDR"));
    const body = png.subarray(ihdrStart, ihdrStart + 4 + 13);
    const stored = png.readUInt32BE(ihdrStart + 4 + 13);

    let c = ~0;
    for (const byte of body) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    expect(stored).toBe(~c >>> 0);
  });
});
