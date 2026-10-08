import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260918071609_multi_vendor_platform.sql",
);

describe("Supabase multi-vendor migration", () => {
  it("backfills the deterministic Chapega tenant before removing legacy roles", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const vendorInsert = sql.indexOf("insert into private.vendors");
    const membershipInsert = sql.indexOf("insert into private.vendor_memberships");
    const roleDrop = sql.indexOf("drop column role");

    expect(sql).toContain("00000000-0000-4000-8000-000000000001");
    expect(sql).toContain("'chapega'");
    expect(vendorInsert).toBeGreaterThan(-1);
    expect(membershipInsert).toBeGreaterThan(vendorInsert);
    expect(roleDrop).toBeGreaterThan(membershipInsert);
  });

  it("requires a live platform session instead of a caller-controlled admin flag", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("private.has_platform_admin_session()");
    expect(sql).toContain("sessions.id_hash = nullif(current_setting('app.session_hash'");
    expect(sql).toContain("sessions.session_scope = 'platform'");
    expect(sql).toContain("sessions.expires_at > now()");
    expect(sql).toContain("users.platform_role = 'super_admin'");
    expect(sql).not.toContain("app.platform_admin");
  });

  it("gives every business table a tenant key and tenant-first index", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const tables = [
      "app_state",
      "shop_settings",
      "products",
      "product_variants",
      "orders",
      "order_items",
      "order_events",
      "audit_log",
      "import_runs",
    ];

    for (const table of tables) {
      expect(sql).toMatch(
        new RegExp(`alter table private\\.${table}[\\s\\S]*?vendor_id`, "i"),
      );
    }
    expect(sql).toContain("products_vendor_archived_updated_at_idx");
    expect(sql).toContain("orders_vendor_status_created_at_idx");
    expect(sql).toContain("audit_log_vendor_created_at_idx");
    expect(sql).toContain("import_runs_vendor_status_started_at_idx");
  });
});

describe("Supabase tenant replacement", () => {
  it("never performs the former global identity or commerce purge", async () => {
    const repository = await readFile(
      path.join(process.cwd(), "server", "vendor", "supabase-database.ts"),
      "utf8",
    );

    expect(repository).not.toMatch(/delete from private\.vendor_users/i);
    expect(repository).not.toMatch(/delete from private\.orders\s*`/i);
    expect(repository).not.toMatch(/delete from private\.products\s*`/i);
    expect(repository).toContain(
      "delete from private.orders where vendor_id = ${resolved.vendorId}",
    );
    expect(repository).toContain(
      "delete from private.products where vendor_id = ${resolved.vendorId}",
    );
  });
});
