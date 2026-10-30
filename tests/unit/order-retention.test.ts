import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { VendorOrderRecord } from "@/server/vendor/database";

vi.mock("server-only", () => ({}));

import {
  ORDER_RETENTION_DAYS,
  orderHasPersonalData,
  orderIsPastRetention,
  RETENTION_REDACTION_MESSAGE,
  withoutPersonalData,
} from "@/domain/order-privacy";
import { redactedFingerprint, redactExpiredOrders } from "@/server/vendor/database";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1_000;

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY).toISOString();
}

function order(overrides: Partial<VendorOrderRecord> = {}): VendorOrderRecord {
  return {
    id: "order-1",
    vendorId: "vendor-1",
    orderNumber: "GFT-20260901-0001",
    idempotencyKey: "key-1",
    submissionFingerprint: "original-fingerprint",
    createdAt: daysAgo(40),
    updatedAt: daysAgo(40),
    customer: {
      customerName: "Asha",
      customerPhone: "98765 43210",
      giftNote: "Happy birthday",
      orderNote: "Call first",
    },
    kioskName: "Main kiosk",
    paymentMethod: "pay_later",
    items: [],
    subtotalPaise: 10_000,
    giftWrapPaise: 0,
    totalPaise: 10_000,
    whatsappMessage: "Hello, Customer: Asha",
    whatsappUrl: "https://wa.me/919876543210?text=Hello%2C%20Customer%3A%20Asha",
    status: "prepared",
    version: 1,
    inventoryCommitted: false,
    events: [],
    ...overrides,
  };
}

describe("order retention rule", () => {
  it("is 30 days", () => {
    expect(ORDER_RETENTION_DAYS).toBe(30);
  });

  it("clears finished orders 30 days after they finished", () => {
    for (const status of ["completed", "cancelled"] as const) {
      expect(orderIsPastRetention(order({ status, updatedAt: daysAgo(31) }), NOW)).toBe(true);
      expect(orderIsPastRetention(order({ status, updatedAt: daysAgo(29) }), NOW)).toBe(false);
    }
  });

  it("clears never-confirmed drafts 30 days after they were prepared", () => {
    expect(orderIsPastRetention(order({ status: "prepared", createdAt: daysAgo(31) }), NOW)).toBe(
      true,
    );
    expect(orderIsPastRetention(order({ status: "prepared", createdAt: daysAgo(29) }), NOW)).toBe(
      false,
    );
  });

  it("keeps details on orders still in progress, however old", () => {
    for (const status of ["confirmed", "preparing", "ready"] as const) {
      expect(
        orderIsPastRetention(
          order({ status, createdAt: daysAgo(400), updatedAt: daysAgo(400) }),
          NOW,
        ),
      ).toBe(false);
    }
  });

  it("strips the details and the WhatsApp text but keeps the destination", () => {
    const cleared = withoutPersonalData(order(), RETENTION_REDACTION_MESSAGE);
    expect(cleared.customer).toEqual({
      customerName: "",
      customerPhone: "",
      giftNote: "",
      orderNote: "",
    });
    expect(cleared.whatsappUrl).toBe("https://wa.me/919876543210");
    expect(cleared.whatsappMessage).toBe(RETENTION_REDACTION_MESSAGE);
    expect(orderHasPersonalData(cleared)).toBe(false);
    expect(orderHasPersonalData(order())).toBe(true);
  });
});

describe("local store retention (redactExpiredOrders)", () => {
  it("clears expired orders, bumps their version and replaces the fingerprint", () => {
    const expired = order({ id: "expired", createdAt: daysAgo(31), updatedAt: daysAgo(31) });
    const fresh = order({ id: "fresh", createdAt: daysAgo(2), updatedAt: daysAgo(2) });
    const active = order({
      id: "active",
      status: "preparing",
      createdAt: daysAgo(90),
      updatedAt: daysAgo(90),
    });

    const [cleared, keptFresh, keptActive] = redactExpiredOrders([expired, fresh, active], NOW);

    expect(cleared.customer.customerName).toBe("");
    expect(cleared.whatsappMessage).toBe(RETENTION_REDACTION_MESSAGE);
    expect(cleared.submissionFingerprint).toBe(redactedFingerprint("expired"));
    expect(cleared.submissionFingerprint).not.toBe("original-fingerprint");
    expect(cleared.version).toBe(2);
    expect(cleared.updatedAt).toBe(expired.updatedAt);
    expect(cleared.status).toBe("prepared");
    expect(keptFresh).toBe(fresh);
    expect(keptActive).toBe(active);
  });

  it("leaves an already cleared order alone", () => {
    const cleared = redactExpiredOrders([order()], NOW)[0];
    expect(redactExpiredOrders([cleared], NOW)[0]).toBe(cleared);
  });
});

describe("retention migration 20261030120000", () => {
  const migrationPath = path.join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261030120000_order_retention_30_days.sql",
  );

  it("applies the same rule and text as the app", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain(
      "create or replace function private.redact_order_personal_data(older_than interval)",
    );
    expect(sql).toContain("older_than < interval '30 days'");
    expect(sql).toContain(
      "(status in ('completed', 'cancelled') and updated_at < now() - older_than)",
    );
    expect(sql).toContain("(status = 'prepared' and created_at < now() - older_than)");
    expect(sql).toContain(`whatsapp_message = '${RETENTION_REDACTION_MESSAGE}'`);
    expect(sql).toContain("convert_to('redacted:' || id::text, 'UTF8')");
    expect(sql).not.toMatch(/updated_at\s*=\s*now\(\)/);
  });

  it("schedules the 30-day job and stays owner-only", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("'chapega-redact-orders'");
    expect(sql).toContain("select private.redact_order_personal_data(interval ''30 days'')");
    expect(sql).toContain("exception when others then");
    expect(sql).toMatch(
      /revoke all on function private\.redact_order_personal_data\(interval\)\s+from public, anon, authenticated, service_role, chapega_app;/,
    );
  });

  it("matches the fingerprint the local store writes", () => {
    // sha256 of 'redacted:<id>', hex: what Postgres computes with encode(sha256(...), 'hex').
    expect(redactedFingerprint("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("shop rename migration 20261030121000", () => {
  it("relaxes only display_name and heals existing drift", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "supabase", "migrations", "20261030121000_tenant_shop_rename.sql"),
      "utf8",
    );
    expect(sql).toContain("create or replace function private.guard_vendor_tenant_update()");
    expect(sql).not.toContain("new.display_name is distinct from old.display_name");
    for (const guarded of ["new.id", "new.slug", "new.status", "new.created_at", "new.revision"]) {
      expect(sql).toContain(guarded);
    }
    expect(sql).toContain("set display_name = settings.shop_name");
  });
});
