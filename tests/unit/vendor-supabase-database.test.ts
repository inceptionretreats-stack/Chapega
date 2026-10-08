import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorAuditRecord, VendorDatabase } from "@/server/vendor/database";

type QueryCall = Readonly<{
  text: string;
  values: readonly unknown[];
}>;

const postgresState = vi.hoisted(() => ({
  auditIds: new Set<string>(),
  calls: [] as QueryCall[],
  getClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/postgres", () => ({
  getSupabasePostgres: postgresState.getClient,
}));

import {
  readSupabaseVendorDatabase,
  replaceSupabaseVendorDatabase,
  updateSupabaseVendorDatabase,
} from "@/server/vendor/supabase-database";

const settingsRow = {
  vendor_id: "00000000-0000-4000-8000-000000000001",
  shop_name: "Chapega.com",
  owner_whatsapp_number: "919876543210",
  default_country_code: "91",
  kiosk_name: "Main Entrance",
  max_cart_quantity: 5,
  gift_wrap_fee_paise: 2_500,
  qr_reset_seconds: 120,
  show_preview_label: false,
  store_open: true,
  low_stock_threshold: 3,
  version: 1,
  updated_at: "2026-09-18T00:00:00.000Z",
};

const snapshotRow = {
  revision: 7,
  vendors: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "chapega",
      display_name: "Chapega.com",
      status: "active",
      revision: 7,
      created_at: "2026-09-18T00:00:00.000Z",
      updated_at: "2026-09-18T00:00:00.000Z",
    },
  ],
  settings: [settingsRow],
  users: [],
  memberships: [],
  sessions: [],
  products: [],
  variants: [],
  orders: [],
  items: [],
  events: [],
};

function queryText(strings: TemplateStringsArray): string {
  return strings.join("?").replace(/\s+/g, " ").trim();
}

function createPostgresClient() {
  const transaction = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = queryText(strings);
      postgresState.calls.push({ text, values });

      if (
        text.includes("as revision") &&
        text.includes("as settings") &&
        text.includes("as users")
      ) {
        return [structuredClone(snapshotRow)];
      }
      if (/delete from private\.audit_log/i.test(text)) {
        postgresState.auditIds.clear();
      }
      if (/insert into private\.audit_log/i.test(text)) {
        postgresState.auditIds.add(String(values[0]));
      }
      return [];
    },
    {
      array: (value: readonly unknown[]) => value,
      json: (value: unknown) => value,
    },
  );

  return Object.assign(transaction, {
    begin: async <T>(operation: (sql: typeof transaction) => Promise<T>) => operation(transaction),
  });
}

const newAuditRecord: VendorAuditRecord = {
  id: "audit-new",
  vendorId: "00000000-0000-4000-8000-000000000001",
  actorId: "owner-1",
  action: "product.updated",
  entityType: "product",
  entityId: "keepsake-1",
  createdAt: "2026-09-18T09:00:00.000Z",
};

beforeEach(() => {
  postgresState.auditIds = new Set(["audit-historical-1", "audit-historical-2"]);
  postgresState.calls = [];
  postgresState.getClient.mockReset().mockReturnValue(createPostgresClient());
});

describe("Supabase vendor audit persistence", () => {
  it("does not materialize audit history during an ordinary vendor read", async () => {
    const database = await readSupabaseVendorDatabase();

    expect(database.audit).toEqual([]);
    expect(
      postgresState.calls.some(
        (call) => /^select\b/i.test(call.text) && /\bfrom private\.audit_log\b/i.test(call.text),
      ),
    ).toBe(false);
  });

  it("appends a new audit record without loading or deleting historical rows", async () => {
    await updateSupabaseVendorDatabase((database) => {
      database.audit.push(newAuditRecord);
      database.revision += 1;
    });

    expect(postgresState.auditIds).toEqual(
      new Set(["audit-historical-1", "audit-historical-2", "audit-new"]),
    );
    expect(
      postgresState.calls.some((call) => /insert into private\.audit_log/i.test(call.text)),
    ).toBe(true);
    expect(
      postgresState.calls.some(
        (call) => /^select\b/i.test(call.text) && /\bfrom private\.audit_log\b/i.test(call.text),
      ),
    ).toBe(false);
    expect(
      postgresState.calls.some((call) => /delete from private\.audit_log/i.test(call.text)),
    ).toBe(false);
  });

  it("still replaces audit history during an explicit database import", async () => {
    const source: VendorDatabase = {
      version: 2,
      revision: 9,
      vendors: snapshotRow.vendors.map((row) => ({
        id: row.id,
        slug: row.slug,
        displayName: row.display_name,
        status: row.status as "active",
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      users: [],
      memberships: [],
      sessions: [],
      products: [],
      orders: [],
      settings: [
        {
          vendorId: settingsRow.vendor_id,
          shopName: settingsRow.shop_name,
          ownerWhatsAppNumber: settingsRow.owner_whatsapp_number,
          defaultCountryCode: settingsRow.default_country_code,
          kioskName: settingsRow.kiosk_name,
          maxCartQuantity: settingsRow.max_cart_quantity,
          giftWrapFeePaise: settingsRow.gift_wrap_fee_paise,
          qrResetSeconds: settingsRow.qr_reset_seconds,
          showPreviewLabel: settingsRow.show_preview_label,
          storeOpen: settingsRow.store_open,
          lowStockThreshold: settingsRow.low_stock_threshold,
          version: settingsRow.version,
          updatedAt: settingsRow.updated_at,
        },
      ],
      audit: [newAuditRecord],
    };

    await expect(replaceSupabaseVendorDatabase(source)).resolves.toBe("imported");
    expect(postgresState.auditIds).toEqual(new Set(["audit-new"]));
  });
});
