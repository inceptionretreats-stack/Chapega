export class VendorClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "VendorClientError";
  }
}

export async function vendorRequest<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
    cache: "no-store",
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok) {
    const error = (payload as {
      error?: {
        code?: string;
        message?: string;
        fields?: Record<string, string[] | undefined>;
      };
    } | undefined)?.error;
    throw new VendorClientError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "The request could not be completed.",
      error?.fields,
    );
  }
  return payload as T;
}

export function commaSeparated(value: readonly string[]): string {
  return value.join(", ");
}

export function parseCommaSeparated(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}
