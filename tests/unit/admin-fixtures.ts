import type { AdminBootstrap, AdminVendorSummary } from "@/types/admin";

export function makeAdminVendor(
  overrides: Partial<AdminVendorSummary> = {},
): AdminVendorSummary {
  return {
    id: "vendor-1",
    slug: "chapega",
    displayName: "Chapega.com",
    status: "active",
    revision: 1,
    owner: { id: "owner-1", name: "Aanya", email: "owner@chapega.com" },
    productCount: 4,
    orderCount: 2,
    createdAt: "2026-09-01T09:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    lastActivityAt: "2026-09-02T09:00:00.000Z",
    ...overrides,
  };
}

export function makeAdminBootstrap(): AdminBootstrap {
  return {
    user: {
      id: "admin-1",
      email: "owner@chapega.com",
      name: "Aanya",
      role: "super_admin",
    },
    metrics: { totalVendors: 1, activeVendors: 1, orderCount: 2, productCount: 4 },
    vendors: [makeAdminVendor()],
    recentActivity: [],
  };
}
