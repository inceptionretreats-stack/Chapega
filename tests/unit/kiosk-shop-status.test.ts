import { beforeEach, describe, expect, it, vi } from "vitest";

import { VendorServiceError } from "@/server/vendor/errors";

const getKioskBootstrap = vi.fn();
vi.mock("@/server/vendor/service", () => ({ getKioskBootstrap }));

const { loadKioskShop } = await import("@/app/kiosk/shop-status");

const bootstrap = {
  vendor: { id: "v1", slug: "rose-gifts", displayName: "Rose Gifts" },
  revision: "1",
  products: [],
  settings: {},
  storeOpen: true,
  syncedAt: "2026-10-08T00:00:00.000Z",
};

describe("server-side shop status (AUD-11)", () => {
  beforeEach(() => getKioskBootstrap.mockReset());

  it("returns the bootstrap for an active shop and normalises the slug", async () => {
    getKioskBootstrap.mockResolvedValue(bootstrap);
    await expect(loadKioskShop("  Rose-Gifts ")).resolves.toEqual({
      status: "ok",
      bootstrap,
    });
    expect(getKioskBootstrap).toHaveBeenCalledWith("rose-gifts");
  });

  it("treats malformed slugs as not found without touching the database", async () => {
    await expect(loadKioskShop("Bad_Slug!")).resolves.toEqual({
      status: "not-found",
    });
    expect(getKioskBootstrap).not.toHaveBeenCalled();
  });

  it("maps unknown shops to not-found and suspended shops to suspended", async () => {
    getKioskBootstrap.mockRejectedValueOnce(new VendorServiceError(404, "VENDOR_NOT_FOUND", "x"));
    await expect(loadKioskShop("no-such-shop")).resolves.toEqual({
      status: "not-found",
    });
    getKioskBootstrap.mockRejectedValueOnce(new VendorServiceError(403, "VENDOR_SUSPENDED", "x"));
    await expect(loadKioskShop("paused-shop")).resolves.toEqual({
      status: "suspended",
    });
  });

  it("reports other failures as errors so the client can retry", async () => {
    getKioskBootstrap.mockRejectedValueOnce(new Error("database down"));
    await expect(loadKioskShop("rose-gifts")).resolves.toEqual({
      status: "error",
    });
  });
});
