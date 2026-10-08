import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const vendorId = randomUUID();
const hash = "c".repeat(64);
const directory = path.join(process.cwd(), "public", "vendor-products", vendorId);
const bytes = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from("test-image-bytes"),
]);

beforeAll(() => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${hash}.png`), bytes);
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function serve(segments: string[], headers: Record<string, string> = {}, method = "GET") {
  vi.stubEnv("CHAPEGA_DATA_BACKEND", "local");
  const route = await import("@/app/api/vendor-products/[...path]/route");
  const handler = method === "HEAD" ? route.HEAD : route.GET;
  return handler(
    new NextRequest(`http://localhost/api/vendor-products/${segments.join("/")}`, {
      method,
      headers,
    }),
    { params: Promise.resolve({ path: segments }) },
  );
}

describe("serving local uploads after build", () => {
  it("streams an uploaded image with a safe content type and a long cache", async () => {
    const response = await serve([vendorId, `${hash}.png`]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(response.headers.get("etag")).toBe(`"${hash}"`);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("answers conditional requests and HEAD without a body", async () => {
    const notModified = await serve([vendorId, `${hash}.png`], { "if-none-match": `"${hash}"` });
    expect(notModified.status).toBe(304);

    const head = await serve([vendorId, `${hash}.png`], {}, "HEAD");
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe(String(bytes.length));
    expect(await head.text()).toBe("");
  });

  it("refuses anything that is not a canonical content-addressed upload", async () => {
    for (const segments of [
      [vendorId, `${hash.toUpperCase()}.png`],
      [vendorId, `${hash}.PNG`],
      [vendorId, `${hash}.svg`],
      [vendorId, "..", "..", "package.json"],
      ["..", "products", "image.png"],
      [vendorId, `${"d".repeat(64)}.png`],
      [`${vendorId}/${hash}.png`],
    ]) {
      const response = await serve(segments);
      expect(response.status, segments.join("/")).toBe(404);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});

describe("next.config.ts /vendor-products rewrite", () => {
  async function rewritesFor(env: Record<string, string>) {
    for (const name of [
      "CHAPEGA_DATA_BACKEND",
      "SUPABASE_DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "ALLOW_LOCAL_VENDOR_BACKEND",
    ]) {
      vi.stubEnv(name, env[name] ?? "");
    }
    vi.stubEnv("NODE_ENV", env.NODE_ENV ?? "development");
    vi.resetModules();
    const config = (await import("@/next.config")).default;
    const rewrites = await config.rewrites?.();
    if (!rewrites || Array.isArray(rewrites)) return rewrites;
    return rewrites.beforeFiles;
  }

  const supabase = {
    SUPABASE_DATABASE_URL: "postgresql://chapega_app.ref:pw@pooler.example.com:6543/postgres",
    NEXT_PUBLIC_SUPABASE_URL: "https://ref.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_x",
  };

  it("uses Supabase Storage when the backend is auto-selected from the Supabase variables", async () => {
    await expect(rewritesFor(supabase)).resolves.toEqual([
      {
        source: "/vendor-products/:path*",
        destination: "https://ref.supabase.co/storage/v1/object/public/vendor-products/:path*",
      },
    ]);
  });

  it("routes uploads to the serving handler for the local backend", async () => {
    await expect(rewritesFor({ CHAPEGA_DATA_BACKEND: "local", ...supabase })).resolves.toEqual([
      { source: "/vendor-products/:path*", destination: "/api/vendor-products/:path*" },
    ]);
    await expect(rewritesFor({})).resolves.toEqual([
      { source: "/vendor-products/:path*", destination: "/api/vendor-products/:path*" },
    ]);
  });
});
