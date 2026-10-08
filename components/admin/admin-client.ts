export class AdminClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "AdminClientError";
  }
}

export async function adminRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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
    const error = (
      payload as
        | {
            error?: {
              code?: string;
              message?: string;
              fields?: Record<string, string[] | undefined>;
            };
          }
        | undefined
    )?.error;
    throw new AdminClientError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "The request could not be completed.",
      error?.fields,
    );
  }

  return payload as T;
}
