import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.VENDOR_EMAIL ?? "owner@chapega.com";
const ADMIN_PASSWORD = process.env.VENDOR_PASSWORD ?? "Chapega@2026";

type VendorMutation = {
  vendor: {
    id: string;
    slug: string;
    displayName: string;
    status: "active" | "suspended";
    revision: number;
  };
};

test("super admin creates an isolated vendor and controls its availability", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? "http://localhost:3100").origin;
  const runId = Date.now().toString(36);
  const slug = `demo-atelier-${runId}`;
  const ownerEmail = `${slug}@example.test`;
  const temporaryPassword = `DemoOwner${runId}A1`;
  const displayName = `Demo Atelier ${runId.toUpperCase()}`;
  const headers = { origin };

  const adminLogin = await page.request.post("/api/admin/login", {
    headers,
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(adminLogin.ok()).toBe(true);

  const createdResponse = await page.request.post("/api/admin/vendors", {
    headers,
    data: {
      displayName,
      slug,
      ownerName: "Demo Owner",
      ownerEmail,
      ownerWhatsAppNumber: "+919999999999",
      temporaryPassword,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as VendorMutation;
  expect(created.vendor).toMatchObject({ slug, displayName, status: "active" });

  const kioskBootstrap = await page.request.get(`/api/kiosk/${slug}/bootstrap`);
  expect(kioskBootstrap.ok()).toBe(true);
  await expect(kioskBootstrap.json()).resolves.toMatchObject({
    vendor: { slug, displayName },
    products: [],
  });

  const vendorLogin = await page.request.post("/api/vendor/login", {
    headers,
    data: { email: ownerEmail, password: temporaryPassword, vendorSlug: slug },
  });
  expect(vendorLogin.ok()).toBe(true);

  const ownWorkspace = await page.request.get(`/api/vendor/${slug}/bootstrap`);
  expect(ownWorkspace.ok()).toBe(true);
  await expect(ownWorkspace.json()).resolves.toMatchObject({
    vendor: { slug, displayName },
    user: { email: ownerEmail, role: "owner" },
  });

  const unrelatedWorkspace = await page.request.get(
    "/api/vendor/chapega/bootstrap",
  );
  expect(unrelatedWorkspace.status()).toBe(401);

  const suspendedResponse = await page.request.patch(
    `/api/admin/vendors/${created.vendor.id}/status`,
    {
      headers,
      data: { status: "suspended", revision: created.vendor.revision },
    },
  );
  expect(suspendedResponse.ok()).toBe(true);
  const suspended = (await suspendedResponse.json()) as VendorMutation;
  expect(suspended.vendor.status).toBe("suspended");

  const suspendedKiosk = await page.request.get(
    `/api/kiosk/${slug}/bootstrap`,
  );
  expect(suspendedKiosk.status()).toBe(403);
  await expect(suspendedKiosk.json()).resolves.toMatchObject({
    error: { code: "VENDOR_SUSPENDED" },
  });

  const suspendedLogin = await page.request.post("/api/vendor/login", {
    headers,
    data: { email: ownerEmail, password: temporaryPassword, vendorSlug: slug },
  });
  expect(suspendedLogin.status()).toBe(403);

  const reactivatedResponse = await page.request.patch(
    `/api/admin/vendors/${created.vendor.id}/status`,
    {
      headers,
      data: { status: "active", revision: suspended.vendor.revision },
    },
  );
  expect(reactivatedResponse.ok()).toBe(true);
  const reactivated = (await reactivatedResponse.json()) as VendorMutation;
  expect(reactivated.vendor.status).toBe("active");

  const reactivatedKiosk = await page.request.get(
    `/api/kiosk/${slug}/bootstrap`,
  );
  expect(reactivatedKiosk.ok()).toBe(true);
});
