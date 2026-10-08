import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({ usesSupabaseBackend: () => false }));
vi.mock("@/server/supabase/admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/server/supabase/postgres", () => ({ getSupabasePostgres: vi.fn() }));

import { sanitizeVendorImage } from "@/server/vendor/images";

function segment(marker: number, payload: Buffer | string): Buffer {
  const body = typeof payload === "string" ? Buffer.from(payload, "latin1") : payload;
  const header = Buffer.alloc(4);
  header[0] = 0xff;
  header[1] = marker;
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

function sof(width: number, height: number): Buffer {
  const body = Buffer.alloc(15);
  body[0] = 8;
  body.writeUInt16BE(height, 1);
  body.writeUInt16BE(width, 3);
  body[5] = 3;
  return segment(0xc0, body);
}

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
// Entropy-coded data with a stuffed 0xFF00 and a restart marker inside.
const SCAN_DATA = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]);

function sos(): Buffer {
  return segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0]));
}

function text(buffer: Buffer): string {
  return buffer.toString("latin1");
}

describe("JPEG sanitizer", () => {
  const baseline = Buffer.concat([
    SOI,
    segment(0xe0, "JFIF\0\x01\x02\0\0\x01\0\x01\0\0"),
    segment(0xe1, "Exif\0\0GPS-SECRET"),
    segment(0xfe, "COMMENT-SECRET"),
    segment(0xe2, "ICC_PROFILE\0\x01\x01colour-profile"),
    segment(0xe2, "MPF\0EMBEDDED-SECRET-IMAGE"),
    segment(0xed, "Photoshop 3.0\0IPTC-SECRET"),
    segment(0xee, "Adobe\0\x64\0\0\0\0\x01"),
    segment(0xdb, Buffer.alloc(65, 1)),
    sof(640, 480),
    segment(0xc4, Buffer.alloc(20, 2)),
    sos(),
    SCAN_DATA,
    EOI,
    Buffer.from("TRAILER-SECRET appended after EOI", "latin1"),
  ]);

  it("drops comments, metadata APPn segments and bytes after EOI", () => {
    const image = sanitizeVendorImage(baseline, "image/jpeg");
    const output = text(image.buffer);

    expect(image).toMatchObject({ extension: "jpg", width: 640, height: 480 });
    for (const secret of ["GPS-SECRET", "COMMENT-SECRET", "EMBEDDED-SECRET", "IPTC-SECRET", "TRAILER-SECRET"]) {
      expect(output, secret).not.toContain(secret);
    }
    expect(output).toContain("JFIF");
    expect(output).toContain("ICC_PROFILE");
    expect(output).toContain("Adobe");
    expect(image.buffer.subarray(-2)).toEqual(EOI);
    expect(image.buffer.includes(SCAN_DATA)).toBe(true);
  });

  it("keeps every scan of a progressive JPEG but strips segments between them", () => {
    const progressive = Buffer.concat([
      SOI,
      segment(0xdb, Buffer.alloc(65, 1)),
      segment(0xc2, sof(10, 20).subarray(4)),
      segment(0xc4, Buffer.alloc(20, 2)),
      sos(),
      SCAN_DATA,
      segment(0xfe, "BETWEEN-SCANS-SECRET"),
      segment(0xc4, Buffer.alloc(20, 3)),
      sos(),
      Buffer.from([0x9a, 0xbc]),
      EOI,
    ]);

    const image = sanitizeVendorImage(progressive, "image/jpeg");
    expect(text(image.buffer)).not.toContain("BETWEEN-SCANS-SECRET");
    expect(image.buffer.includes(SCAN_DATA)).toBe(true);
    expect(image.buffer.includes(Buffer.from([0x9a, 0xbc, 0xff, 0xd9]))).toBe(true);
    expect(image).toMatchObject({ width: 10, height: 20 });
  });

  it("rejects a JPEG without an end-of-image marker", () => {
    expect(() =>
      sanitizeVendorImage(Buffer.concat([SOI, sof(4, 4), sos(), SCAN_DATA]), "image/jpeg"),
    ).toThrow(expect.objectContaining({ status: 400 }));
  });
});

function chunk(type: string, data: Buffer | string = Buffer.alloc(0)): Buffer {
  const body = typeof data === "string" ? Buffer.from(data, "latin1") : data;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, body, Buffer.alloc(4)]);
}

function ihdr(width: number, height: number): Buffer {
  const body = Buffer.alloc(13);
  body.writeUInt32BE(width, 0);
  body.writeUInt32BE(height, 4);
  body[8] = 8;
  body[9] = 6;
  return chunk("IHDR", body);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("PNG sanitizer", () => {
  it("keeps only critical and colour/transparency/density chunks", () => {
    const png = Buffer.concat([
      PNG_SIGNATURE,
      ihdr(32, 16),
      chunk("gAMA", Buffer.alloc(4, 1)),
      chunk("sRGB", Buffer.alloc(1)),
      chunk("pHYs", Buffer.alloc(9)),
      chunk("tEXt", "Comment\0TEXT-SECRET"),
      chunk("prVt", "PRIVATE-CHUNK-SECRET"),
      chunk("vpAg", "VPAG-SECRET"),
      chunk("acTL", "ANIMATION-SECRET"),
      chunk("tIME", "TIME-SECRET"),
      chunk("tRNS", Buffer.alloc(2)),
      chunk("IDAT", Buffer.from("pixel-data", "latin1")),
      chunk("IEND"),
      Buffer.from("TRAILER-SECRET", "latin1"),
    ]);

    const image = sanitizeVendorImage(png, "image/png");
    const output = text(image.buffer);

    expect(image).toMatchObject({ extension: "png", width: 32, height: 16 });
    for (const kept of ["IHDR", "gAMA", "sRGB", "pHYs", "tRNS", "IDAT", "IEND", "pixel-data"]) {
      expect(output, kept).toContain(kept);
    }
    for (const secret of ["TEXT-SECRET", "PRIVATE-CHUNK-SECRET", "VPAG-SECRET", "ANIMATION-SECRET", "TIME-SECRET", "TRAILER-SECRET"]) {
      expect(output, secret).not.toContain(secret);
    }
  });

  it("rejects unknown critical chunks", () => {
    const png = Buffer.concat([
      PNG_SIGNATURE,
      ihdr(1, 1),
      chunk("ZZZZ", "unknown critical"),
      chunk("IDAT", "x"),
      chunk("IEND"),
    ]);
    expect(() => sanitizeVendorImage(png, "image/png")).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});
