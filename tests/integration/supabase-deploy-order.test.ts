import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { VendorAccessContext } from "@/types/vendor";
import {
  ADMIN_URL,
  APP_PASSWORD,
  CHAPEGA_ID,
  MULTI_VENDOR_MIGRATION,
  OWNER,
  ROLE_MIGRATION,
  SUPABASE_STUBS,
  applyMigration,
  blanketPolicies,
  clientOptions,
  migrationFiles,
  ownerContext,
  productInput,
  resetApplicationPool,
  useApplicationDatabase,
} from "./helpers";

vi.mock("server-only", () => ({}));

/** Migrations shipped with the 2026-10-08 audit release. */
const AUDIT_RELEASE = (file: string) => file >= "20261008";

type Services = typeof import("@/server/vendor/service");

/**
 * CHANGELOG: deploy this release's app first, then its migrations. This
 * replays that order on a database in the pre-audit production state
 * (blanket policies from the old provisioning step) and checks that the new
 * app keeps taking orders and edits at both stages.
 */
describe.skipIf(!ADMIN_URL)("deploying the audit release app-first", () => {
  const databaseName = `chapega_deploy_${Date.now()}`;
  let root: postgres.Sql;
  let admin: postgres.Sql;
  let services: Services;
  let context: VendorAccessContext;

  async function exerciseTenantWrites(label: string) {
    const product = await services.createVendorProduct(productInput(`${label} Frame`), context);
    const edited = await services.updateVendorProduct(
      product.id,
      { ...product, pricePaise: 55_500, version: product.version },
      context,
    );
    const bootstrap = await services.getVendorBootstrap(context);
    await services.updateVendorSettings({ ...bootstrap.settings, kioskName: `${label} Desk` }, context);
    const order = await services.recordKioskOrder(
      {
        idempotencyKey: randomUUID(),
        kioskName: `${label} Desk`,
        customer: { customerName: "Asha", customerPhone: "", giftNote: "", orderNote: "" },
        items: [{ productId: product.id, quantity: 1, giftWrapped: false }],
      },
      "chapega",
    );
    const confirmed = await services.transitionVendorOrder(order.id, "confirmed", order.version, context);
    return { price: edited.pricePaise, status: confirmed.status };
  }

  beforeAll(async () => {
    root = postgres(ADMIN_URL!, clientOptions());
    await root.unsafe(`create database ${databaseName}`);
    const databaseUrl = new URL(ADMIN_URL!);
    databaseUrl.pathname = `/${databaseName}`;
    admin = postgres(databaseUrl.toString(), clientOptions());

    // Production before this release: the old migrations, the blanket
    // policies the old provisioning step created, and a runtime login.
    await admin.unsafe(SUPABASE_STUBS);
    for (const file of migrationFiles().filter((name) => !AUDIT_RELEASE(name))) {
      await applyMigration(admin, file);
      if (file === MULTI_VENDOR_MIGRATION) await applyMigration(admin, ROLE_MIGRATION);
    }
    await admin.unsafe(`alter role chapega_app with login password '${APP_PASSWORD}'`);

    useApplicationDatabase(databaseUrl);
    await resetApplicationPool();

    const { derivePasswordHash } = await import("@/server/vendor/crypto");
    const { bootstrapFirstOwner } = await import("@/scripts/bootstrap-supabase-owner");
    const { userId } = await bootstrapFirstOwner(
      admin,
      { vendorSlug: "chapega", ...OWNER },
      (password) => derivePasswordHash(password),
    );
    services = await import("@/server/vendor/service");
    const { capabilitiesForVendorRole } = await import("@/server/vendor/auth");
    const [vendor] = await admin<{ displayName: string }[]>`
      select display_name as "displayName" from private.vendors where id = ${CHAPEGA_ID}`;
    context = ownerContext(
      { id: CHAPEGA_ID, slug: "chapega", displayName: vendor.displayName, status: "active" },
      userId,
      capabilitiesForVendorRole("owner"),
    );
  }, 180_000);

  afterAll(async () => {
    await resetApplicationPool().catch(() => undefined);
    await admin?.end({ timeout: 5 });
    await root?.unsafe(`drop database if exists ${databaseName} with (force)`);
    await root?.end({ timeout: 5 });
  });

  it("takes orders and edits on the pre-audit schema (step 1: new app deployed)", async () => {
    expect((await blanketPolicies(admin)).length).toBeGreaterThan(10);
    await expect(exerciseTenantWrites("Before")).resolves.toEqual({
      price: 55_500,
      status: "confirmed",
    });
  });

  it("keeps working once the release migrations and provisioning run (step 2)", async () => {
    for (const file of migrationFiles().filter(AUDIT_RELEASE)) await applyMigration(admin, file);
    const { provisionRuntimeRole } = await import("@/scripts/provision-supabase-role");
    await provisionRuntimeRole(admin, APP_PASSWORD);
    await resetApplicationPool();

    expect(await blanketPolicies(admin)).toEqual([]);
    await expect(exerciseTenantWrites("After")).resolves.toEqual({
      price: 55_500,
      status: "confirmed",
    });
  });
});
