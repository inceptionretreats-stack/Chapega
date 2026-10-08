import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { getSupabaseConfiguration, usesSupabaseBackend } from "@/server/supabase/config";
import { findLocalVendorUpload } from "@/server/vendor/image-lifecycle";
import { withRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ path: string[] }> }>;

/**
 * Runtime uploads. `next start` serves only the public/ files present at
 * build time, so /vendor-products/* is rewritten here (next.config.ts) when
 * the local backend is used. Names are SHA-256 content hashes, so a hit can
 * be cached for a year and revalidated by ETag.
 */
const SAFE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
};

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { ...SAFE_HEADERS, "Cache-Control": "no-store" },
  });
}

async function serve(request: NextRequest, context: Context): Promise<Response> {
  const { path: segments } = await context.params;

  if (usesSupabaseBackend()) {
    // Normally served by the Supabase Storage rewrite; only reached when the
    // build and the runtime disagree about the backend.
    const key = segments.join("/");
    if (!/^(?:[0-9a-f-]{36}\/)?[a-f0-9]{64}\.(?:png|jpg)$/.test(key)) return notFound();
    const { projectUrl } = getSupabaseConfiguration();
    return Response.redirect(
      `${projectUrl}/storage/v1/object/public/vendor-products/${key}`,
      307,
    );
  }

  const upload = await findLocalVendorUpload(segments);
  if (!upload) return notFound();

  const etag = `"${upload.hash}"`;
  const headers = {
    ...SAFE_HEADERS,
    "Content-Type": upload.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag)) {
    return new Response(null, { status: 304, headers });
  }
  const body =
    request.method === "HEAD"
      ? null
      : (Readable.toWeb(createReadStream(upload.filePath)) as unknown as ReadableStream<Uint8Array>);
  return new Response(body, {
    status: 200,
    headers: { ...headers, "Content-Length": String(upload.size) },
  });
}

export const GET = withRequestContext(serve);
export const HEAD = withRequestContext(serve);
