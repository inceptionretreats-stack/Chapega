import { describe, expect, it, vi } from "vitest";
import type {
  VendorMembershipRecord,
  VendorRecord,
  VendorUserRecord,
} from "@/server/vendor/database";

vi.mock("server-only", () => ({}));

import {
  capabilitiesForVendorRole,
  vendorAccessContextFromUser,
  vendorUserFromDatabase,
} from "@/server/vendor/auth";

const vendors: VendorRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "chapega",
    displayName: "Chapega.com",
    status: "active",
    revision: 3,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    slug: "paused-shop",
    displayName: "Paused Shop",
    status: "suspended",
    revision: 1,
    createdAt: "2026-09-18T00:00:00.000Z",
    updatedAt: "2026-09-18T00:00:00.000Z",
  },
];

const user: VendorUserRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "operator@example.com",
  name: "Operator",
  platformRole: null,
  passwordSalt: "salt",
  passwordHash: "hash",
  active: true,
  createdAt: "2026-09-18T00:00:00.000Z",
};

const memberships: VendorMembershipRecord[] = [
  {
    vendorId: vendors[0].id,
    userId: user.id,
    role: "manager",
    active: true,
    isDefault: true,
    createdAt: "2026-09-18T00:00:00.000Z",
  },
  {
    vendorId: vendors[1].id,
    userId: user.id,
    role: "owner",
    active: true,
    isDefault: false,
    createdAt: "2026-09-18T00:00:00.000Z",
  },
];

describe("vendor access contexts", () => {
  it("derives capabilities from the active membership instead of platform role", () => {
    const publicUser = vendorUserFromDatabase(
      { vendors, memberships },
      user,
      vendors[0].id,
    );

    expect(publicUser).not.toBeNull();
    expect(publicUser?.role).toBe("manager");
    expect(publicUser?.capabilities).toEqual({
      view_dashboard: true,
      manage_orders: true,
      manage_catalogue: true,
      manage_settings: false,
      manage_team: false,
    });
    expect(
      publicUser?.memberships.map((membership) => membership.vendor.slug),
    ).toEqual(["chapega", "paused-shop"]);
    expect(vendorAccessContextFromUser(publicUser!).vendor.id).toBe(
      vendors[0].id,
    );
  });

  it("refuses suspended vendors even when the membership is active", () => {
    expect(
      vendorUserFromDatabase({ vendors, memberships }, user, vendors[1].id),
    ).toBeNull();
  });

  it("gives staff order operations without catalogue or settings access", () => {
    expect(capabilitiesForVendorRole("staff")).toEqual({
      view_dashboard: true,
      manage_orders: true,
      manage_catalogue: false,
      manage_settings: false,
      manage_team: false,
    });
  });
});
