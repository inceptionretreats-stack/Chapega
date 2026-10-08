import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createAdminVendorSchema, RESERVED_VENDOR_SLUGS } from "@/server/admin/schemas";

const vendor = {
  displayName: "Petal House",
  ownerName: "Mira Owner",
  ownerEmail: "mira@example.com",
  ownerWhatsAppNumber: "+91 98765 43210",
  temporaryPassword: "lantern over the quiet harbour",
};

/** Static route segments that sit beside a [vendorSlug] segment. */
function staticSiblings(...segments: string[]): string[] {
  const directory = path.join(process.cwd(), "app", ...segments);
  return readdirSync(directory).filter(
    (entry) => statSync(path.join(directory, entry)).isDirectory() && !entry.startsWith("["),
  );
}

describe("vendor slug validation", () => {
  it("rejects every static route segment that would shadow a shop", () => {
    const colliding = new Set([
      ...staticSiblings("vendor"),
      ...staticSiblings("kiosk"),
      ...staticSiblings("api", "vendor"),
      ...staticSiblings("api", "kiosk"),
      ...staticSiblings("api"),
      ...staticSiblings(),
    ]);
    for (const slug of colliding) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
      expect(RESERVED_VENDOR_SLUGS.has(slug), slug).toBe(true);
    }
  });

  it("explains the problem on the slug field", () => {
    for (const slug of [
      "products",
      "orders",
      "login",
      "select",
      "bootstrap",
      "uploads",
      "settings",
      "logout",
      "admin",
      "api",
    ]) {
      const result = createAdminVendorSchema.safeParse({ ...vendor, slug });
      expect(result.success, slug).toBe(false);
      expect(result.error?.flatten().fieldErrors.slug?.[0]).toMatch(/reserved/i);
    }
    expect(createAdminVendorSchema.safeParse({ ...vendor, slug: " Products " }).success).toBe(
      false,
    );
  });

  it("still accepts ordinary shop names", () => {
    expect(createAdminVendorSchema.safeParse({ ...vendor, slug: "petal-house" }).success).toBe(
      true,
    );
    expect(createAdminVendorSchema.safeParse({ ...vendor, slug: "products-plus" }).success).toBe(
      true,
    );
  });
});
