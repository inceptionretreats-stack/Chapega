import { afterEach, describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => ({ options: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({
  getSupabaseConfiguration: () => ({
    projectUrl: "https://example.supabase.co",
    secretKey: "sb_secret_test",
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: unknown) => {
    created.options = options;
    return {};
  },
}));

import { getSupabaseAdmin } from "@/server/supabase/admin";

type FetchOption = { global?: { fetch?: typeof fetch } };

describe("Supabase Storage client (AUD-26)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds every Storage request with a timeout and keeps the caller's signal", async () => {
    getSupabaseAdmin();
    const wrapped = (created.options as FetchOption).global?.fetch;
    expect(wrapped).toBeTypeOf("function");

    const seen: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) seen.push(init.signal);
        return new Response("{}");
      }),
    );

    await wrapped!("https://example.supabase.co/storage/v1/bucket");
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0].aborted).toBe(false);

    const caller = new AbortController();
    await wrapped!("https://example.supabase.co/storage/v1/bucket", {
      signal: caller.signal,
    });
    caller.abort();
    expect(seen[1].aborted).toBe(true);
  });
});
