import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  getRequestVendorContext: vi.fn(),
  saveVendorImage: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/auth", () => ({
  getRequestVendorContext: mocks.getRequestVendorContext,
}));
vi.mock("@/server/vendor/images", () => ({
  saveVendorImage: mocks.saveVendorImage,
}));
vi.mock("@/server/vendor/image-lifecycle", () => ({
  deleteUnusedVendorImage: vi.fn(),
  VENDOR_UPLOAD_PATH_PATTERN: /^\/vendor-products\/[a-f0-9]{64}\.(?:png|jpg)$/,
}));

import { parseJson } from "@/server/vendor/api";
import { parseAdminJson } from "@/server/admin/api";
import { POST as uploadScoped } from "@/app/api/vendor/[vendorSlug]/uploads/route";
import { POST as uploadUnscoped } from "@/app/api/vendor/uploads/route";

const CHUNK = 64 * 1024;

/**
 * A chunked body (no Content-Length) that is generated lazily and records how
 * much of it the server actually pulled. A 400 MB body would make the old
 * implementation buffer everything before rejecting it.
 */
function meteredBody(totalBytes: number, prefix = "") {
  const meter = { pulled: 0 };
  const encoder = new TextEncoder();
  let sentPrefix = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sentPrefix && prefix) {
        sentPrefix = true;
        const bytes = encoder.encode(prefix);
        meter.pulled += bytes.byteLength;
        controller.enqueue(bytes);
        return;
      }
      if (meter.pulled >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(CHUNK, totalBytes - meter.pulled);
      meter.pulled += size;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
  return { stream, meter };
}

function streamingRequest(
  url: string,
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string>,
): NextRequest {
  // `duplex: "half"` is required by undici for streamed request bodies.
  const init = { method: "POST", headers, body, duplex: "half" };
  return new NextRequest(new Request(url, init as RequestInit));
}

const owner = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    capabilities: { manage_catalogue: true },
  },
  vendor: { id: "00000000-0000-4000-8000-000000000001" },
  capabilities: { manage_catalogue: true },
};

beforeEach(() => {
  mocks.getRequestVendorContext.mockReset().mockResolvedValue(owner);
  mocks.saveVendorImage.mockReset().mockResolvedValue({ path: "/x.png", width: 1, height: 1 });
});

describe("streamed JSON body limits", () => {
  it("stops reading a chunked vendor JSON body as soon as it exceeds 128 KiB", async () => {
    const { stream, meter } = meteredBody(64 * 1024 * 1024, '{"padding":"');
    const request = streamingRequest("http://localhost/api/vendor/products", stream, {
      "content-type": "application/json",
    });

    await expect(parseJson(request, z.object({}).passthrough())).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(meter.pulled).toBeLessThan(128 * 1024 + 4 * CHUNK);
  });

  it("stops reading a chunked admin JSON body as soon as it exceeds 64 KiB", async () => {
    const { stream, meter } = meteredBody(64 * 1024 * 1024, '{"padding":"');
    const request = streamingRequest("http://localhost/api/admin/vendors", stream, {
      "content-type": "application/json",
    });

    await expect(parseAdminJson(request, z.object({}).passthrough())).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });
    expect(meter.pulled).toBeLessThan(64 * 1024 + 4 * CHUNK);
  });

  it("rejects an oversized declared Content-Length without reading", async () => {
    const { stream, meter } = meteredBody(1024 * 1024);
    const request = streamingRequest("http://localhost/api/vendor/products", stream, {
      "content-type": "application/json",
      "content-length": String(1024 * 1024),
    });

    await expect(parseJson(request, z.object({}))).rejects.toMatchObject({ status: 413 });
    // Only the stream's read-ahead (a few chunks of the 16) is ever pulled.
    expect(meter.pulled).toBeLessThanOrEqual(4 * CHUNK);
  });

  it("still parses a body within the limit", async () => {
    const request = new NextRequest("http://localhost/api/vendor/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Frame" }),
    });

    await expect(parseJson(request, z.object({ name: z.string() }))).resolves.toEqual({
      name: "Frame",
    });
  });
});

describe("streamed multipart upload limits", () => {
  for (const [label, handler, url, args] of [
    [
      "scoped",
      uploadScoped,
      "http://localhost/api/vendor/chapega/uploads",
      { params: Promise.resolve({ vendorSlug: "chapega" }) },
    ],
    ["unscoped", uploadUnscoped, "http://localhost/api/vendor/uploads", undefined],
  ] as const) {
    it(`aborts a chunked ${label} upload after 9 MiB instead of buffering it`, async () => {
      const boundary = "----chapega-test-boundary";
      const { stream, meter } = meteredBody(
        400 * 1024 * 1024,
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
      );
      const request = streamingRequest(url, stream, {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        origin: "http://localhost",
      });

      const response = await (
        handler as (request: NextRequest, context: unknown) => Promise<Response>
      )(request, args);

      expect(response.status).toBe(413);
      expect(meter.pulled).toBeLessThan(9 * 1024 * 1024 + 4 * CHUNK);
      expect(mocks.saveVendorImage).not.toHaveBeenCalled();
    });
  }
});
