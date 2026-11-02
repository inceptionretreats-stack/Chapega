// @vitest-environment jsdom

import { act, createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VendorDashboard } from "@/components/vendor/vendor-dashboard";
import { makeBootstrap, makeOrder } from "./portal-fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NativeDateTimeFormat = Intl.DateTimeFormat;
let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Vendor Studio dashboard hydration", () => {
  it.each([
    {
      description: "the browser uses different date punctuation and a different local day",
      serverNow: "2026-10-31T19:00:00.000Z",
      clientNow: "2026-10-31T19:00:00.000Z",
      clientTimeZone: "Asia/Kolkata",
      createdAt: ["2026-10-31T12:00:00.000Z", "2026-10-31T18:45:00.000Z"],
      serverLabel: "Saturday, 31 October",
      clientLabel: "Sunday, 1 November",
    },
    {
      description: "midnight passes between the server render and hydration",
      serverNow: "2026-10-31T23:59:59.000Z",
      clientNow: "2026-11-01T00:00:02.000Z",
      clientTimeZone: "UTC",
      createdAt: ["2026-10-31T12:00:00.000Z", "2026-11-01T00:00:00.000Z"],
      serverLabel: "Saturday, 31 October",
      clientLabel: "Sunday, 1 November",
    },
  ])("keeps the initial summary stable when $description", async (scenario) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(scenario.serverNow));
    let runtimeTimeZone = "UTC";
    let safariPunctuation = false;
    // Model the real ICU difference seen in Safari, independently of the
    // implementation: date fields agree, but the formatted literals do not.
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      const formatter = new NativeDateTimeFormat(locales, {
        ...options,
        timeZone: options?.timeZone ?? runtimeTimeZone,
      });
      return new Proxy(formatter, {
        get(target, property) {
          if (property === "format") {
            return (value: Date | number) => {
              const text = target.format(value);
              return safariPunctuation ? text.replaceAll(",", "") : text;
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });

    const orders = scenario.createdAt.map((createdAt, index) =>
      makeOrder(index + 1, { createdAt, status: "completed" }),
    );
    const props = {
      data: makeBootstrap({ orders }),
      initialCalendar: { now: Date.now(), timeZone: "UTC" },
      onViewOrders: vi.fn(),
      onViewProducts: vi.fn(),
      onOpenOrder: vi.fn(),
    };
    const element = createElement(VendorDashboard, props);
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);
    expect(container.querySelector(".vendor-summary-heading span")?.textContent).toBe(
      scenario.serverLabel,
    );
    const serverCount = container.querySelector(".vendor-summary-stat strong")?.textContent;

    runtimeTimeZone = scenario.clientTimeZone;
    safariPunctuation = true;
    vi.setSystemTime(new Date(scenario.clientNow));
    const onRecoverableError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector(".vendor-summary-heading span")?.textContent).toBe(
      scenario.clientLabel,
    );
    expect(container.querySelector(".vendor-summary-stat strong")?.textContent).toBe("1");
    if (scenario.clientTimeZone !== "UTC") expect(serverCount).toBe("2");

    // Existing bootstrap polling re-renders the dashboard. It must keep
    // using the current device day after hydration, not the original seed.
    vi.setSystemTime(new Date("2026-11-02T12:00:00.000Z"));
    await act(async () => root!.render(createElement(VendorDashboard, props)));
    expect(container.querySelector(".vendor-summary-heading span")?.textContent).toBe(
      "Monday, 2 November",
    );
    expect(container.querySelector(".vendor-summary-stat strong")?.textContent).toBe("0");
  });
});
