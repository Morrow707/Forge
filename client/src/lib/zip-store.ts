/** A ZIP file built in the browser with no dependency and no compression.
 *
 * The only thing this is ever asked to hold is JPEG frames, which are already compressed --
 * deflating them again buys a percent or two and would mean pulling in a compression library
 * for it. STORE (method 0) is a legal zip that every unarchiver on every platform opens.
 *
 * Written rather than installed because the alternative was adding a dependency to the CLIENT
 * bundle for one admin screen, and client/src/lib/bundle-budget.test.ts exists precisely to
 * stop that kind of thing arriving unnoticed.
 */

function crc32(bytes: Uint8Array): number {
  // Table built once on first use -- 256 entries, cheaper than shipping it as a literal.
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
let crcTable: Uint32Array | null = null;

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
  };
}

export type ZipEntry = { name: string; bytes: Uint8Array };

export function buildStoredZip(entries: ZipEntry[], now = new Date()): Blob {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  // BlobPart rather than Uint8Array[]: TypeScript 5.7 made Uint8Array generic over its buffer,
  // and a Uint8Array<ArrayBufferLike> is not assignable to BlobPart without saying so.
  const locals: BlobPart[] = [];
  const centrals: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // local file header
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method 0 = stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true); // compressed
    local.setUint32(22, size, true); // uncompressed
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra length
    locals.push(new Uint8Array(local.buffer) as BlobPart, nameBytes as BlobPart, entry.bytes as BlobPart);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); // central directory header
    central.setUint16(4, 20, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true); // comment length
    central.setUint16(34, 0, true); // disk number
    central.setUint16(36, 0, true); // internal attrs
    central.setUint32(38, 0, true); // external attrs
    central.setUint32(42, offset, true); // offset of local header
    centrals.push(new Uint8Array(central.buffer) as BlobPart, nameBytes as BlobPart);

    offset += 30 + nameBytes.length + size;
  }

  const centralSize = centrals.reduce((sum, part) => sum + (part as Uint8Array).length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true); // comment length

  return new Blob([...locals, ...centrals, new Uint8Array(end.buffer) as BlobPart], {
    type: "application/zip",
  });
}
