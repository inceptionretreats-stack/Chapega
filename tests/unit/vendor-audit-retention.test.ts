import { describe, expect, it, vi } from "vitest";

import type { VendorAuditRecord } from "@/server/vendor/database";

vi.mock("server-only", () => ({}));

import { boundedAudit } from "@/server/vendor/database";

function entry(index: number, actorId: string, action: string): VendorAuditRecord {
  return {
    id: `audit-${index}`,
    vendorId: null,
    actorId,
    action,
    entityType: actorId === "kiosk" ? "order" : "platform",
    entityId: `entity-${index}`,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
  };
}

describe("local audit retention (AUD-20)", () => {
  it("keeps security events when anonymous kiosk orders flood the log", () => {
    const login = entry(0, "user-1", "platform.login");
    const flood = Array.from({ length: 6_000 }, (_, index) =>
      entry(index + 1, "kiosk", "order.prepared"),
    );

    const kept = boundedAudit([login, ...flood], 5_000);

    expect(kept).toHaveLength(5_000);
    expect(kept[0]).toEqual(login);
    expect(kept.at(-1)?.id).toBe("audit-6000");
  });

  it("trims the oldest entries once only security events remain", () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry(index, "user-1", "vendor.login"),
    );

    expect(boundedAudit(entries, 10).map((item) => item.id)).toEqual(
      entries.slice(2).map((item) => item.id),
    );
  });
});
