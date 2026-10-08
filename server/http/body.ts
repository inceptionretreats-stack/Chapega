import "server-only";

/**
 * Raised when a request body exceeds its cap. Callers translate it into their
 * own 413 error type (vendor or admin).
 */
export class RequestBodyTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Request body exceeds ${limitBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
  }
}

function declaredLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (header === null || header.trim() === "") return null;
  const value = Number(header);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Read a request body into memory while enforcing `maxBytes` on the stream
 * itself. A declared Content-Length above the cap is rejected before reading;
 * a chunked (or lying) body is cancelled as soon as the running total passes
 * the cap, so memory use is bounded by the cap plus one chunk regardless of
 * what the client sends.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = declaredLength(request);
  if (declared !== null && declared > maxBytes) {
    await request.body?.cancel().catch(() => undefined);
    throw new RequestBodyTooLargeError(maxBytes);
  }
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** Decode a capped body as UTF-8 JSON; `ok: false` for malformed input. */
export function parseJsonBytes(bytes: Buffer): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(utf8.decode(bytes)) };
  } catch {
    return { ok: false };
  }
}

/**
 * Parse multipart/form-data from a capped body. The bytes are re-wrapped in a
 * Response so the platform's standards-compliant parser does the work.
 */
export async function readMultipartWithLimit(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  const bytes = await readBodyWithLimit(request, maxBytes);
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": contentType },
  }).formData();
}
