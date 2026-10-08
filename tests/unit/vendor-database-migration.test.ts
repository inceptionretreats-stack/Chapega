import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let temporaryDirectory: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe("local vendor database migration", () => {
  it("upgrades a v1 snapshot into Chapega tenancy without losing records", async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "chapega-db-v1-"));
    vi.stubEnv("CHAPEGA_DATA_BACKEND", "local");
    vi.stubEnv("CHAPEGA_DATA_DIR", temporaryDirectory);
    vi.stubEnv("VENDOR_EMAIL", "owner@example.com");
    vi.stubEnv("VENDOR_PASSWORD", "a-long-private-password");
    vi.stubEnv("VENDOR_NAME", "Legacy Owner");
    vi.resetModules();
    delete (
      globalThis as typeof globalThis & {
        __chapegaVendorDatabaseRuntime?: unknown;
      }
    ).__chapegaVendorDatabaseRuntime;

    const { sha256 } = await import("@/server/vendor/crypto");
    const legacy = {
      version: 1,
      revision: 7,
      users: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          email: "owner@example.com",
          name: "Legacy Owner",
          role: "owner",
          passwordSalt: "legacy-salt",
          passwordHash: "legacy-hash",
          active: true,
          createdAt: "2026-09-17T00:00:00.000Z",
        },
      ],
      sessions: [],
      products: [],
      orders: [],
      settings: {
        shopName: "Legacy Chapega",
        ownerWhatsAppNumber: "919876543210",
        defaultCountryCode: "91",
        kioskName: "Legacy kiosk",
        maxCartQuantity: 5,
        giftWrapFeePaise: 2_500,
        qrResetSeconds: 120,
        showPreviewLabel: false,
        storeOpen: true,
        lowStockThreshold: 3,
        version: 4,
        updatedAt: "2026-09-17T00:00:00.000Z",
      },
      audit: [],
    } as const;
    const payload = JSON.stringify(legacy);
    await writeFile(
      path.join(temporaryDirectory, "vendor-db.json"),
      JSON.stringify({ checksum: sha256(payload), data: legacy }),
      "utf8",
    );

    const { readLocalVendorDatabase, DEFAULT_VENDOR_ID } =
      await import("@/server/vendor/database");
    const upgraded = await readLocalVendorDatabase();

    expect(upgraded.version).toBe(2);
    expect(upgraded.revision).toBe(7);
    expect(upgraded.vendors).toEqual([
      expect.objectContaining({
        id: DEFAULT_VENDOR_ID,
        slug: "chapega",
        displayName: "Legacy Chapega",
        revision: 7,
      }),
    ]);
    expect(upgraded.users[0]).toMatchObject({
      email: "owner@example.com",
      platformRole: "super_admin",
    });
    expect(upgraded.memberships[0]).toMatchObject({
      vendorId: DEFAULT_VENDOR_ID,
      role: "owner",
      isDefault: true,
    });
    expect(upgraded.settings[0]).toMatchObject({
      vendorId: DEFAULT_VENDOR_ID,
      kioskName: "Legacy kiosk",
      version: 4,
    });

    const persisted = JSON.parse(
      await readFile(path.join(temporaryDirectory, "vendor-db.json"), "utf8"),
    ) as { data: { version: number } };
    expect(persisted.data.version).toBe(2);
  });
});
