// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortal } from "@/components/admin/admin-portal";
import { VendorPortal } from "@/components/vendor/vendor-portal";
import { BACKGROUND_REFRESH_HEADER } from "@/domain/session-activity";
import { makeAdminBootstrap } from "./admin-fixtures";
import { makeBootstrap } from "./portal-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  fetchMock = vi.fn(
    async (input: string) =>
      new Response(
        JSON.stringify(input.includes("/api/admin/") ? makeAdminBootstrap() : makeBootstrap()),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function refreshHeaders(): Array<string | null> {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith("/bootstrap"))
    .map(([, init]) =>
      new Headers((init as RequestInit | undefined)?.headers).get(BACKGROUND_REFRESH_HEADER),
    );
}

describe("timer refreshes do not keep a session alive (AUD-17)", () => {
  it("marks the Vendor Studio poll as background but not a return to the tab", async () => {
    render(createElement(VendorPortal, { initialData: makeBootstrap() }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(refreshHeaders()).toEqual(["background"]);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(refreshHeaders()).toEqual(["background", null]);
  });

  it("marks the admin poll as background but not a return to the tab", async () => {
    render(createElement(AdminPortal, { initialData: makeAdminBootstrap() }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    expect(refreshHeaders()).toEqual(["background"]);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(refreshHeaders()).toEqual(["background", null]);
  });
});
