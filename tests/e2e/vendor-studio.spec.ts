import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { fillHydrated, isVendorMobileLayout } from "./helpers";

const VENDOR_EMAIL = process.env.VENDOR_EMAIL ?? "owner@chapega.com";
const VENDOR_PASSWORD = process.env.VENDOR_PASSWORD ?? "Chapega@2026";
const VENDOR_NAME = process.env.VENDOR_NAME ?? "Aanya";
const PRODUCT_IMAGE = resolve(
  process.cwd(),
  "public",
  "generated-products",
  "engraved-photo-clock-11x11.png",
);

type VendorProduct = {
  compareAtPricePaise?: number;
  id: string;
  name: string;
  stock: number;
  version: number;
};

type VendorOrder = {
  events: Array<{
    actorName: string;
    from: string | null;
    id: string;
    note?: string;
    to: string;
  }>;
  id: string;
  idempotencyKey: string;
  inventoryCommitted: boolean;
  orderNumber: string;
  status: string;
  version: number;
};

type VendorBootstrap = {
  orders: VendorOrder[];
  products: VendorProduct[];
  settings: {
    kioskName: string;
    ownerWhatsAppNumber: string;
  };
};

function vendorSidebar(page: Page) {
  return page.locator(".vendor-sidebar");
}

type VendorViewName = "Products" | "Orders" | "Settings";

/** Open a studio view via the sidebar on desktop or the bottom nav on mobile. */
async function openVendorView(page: Page, view: VendorViewName) {
  if (isVendorMobileLayout(page)) {
    const bottomNav = page.getByRole("navigation", { name: "Mobile vendor navigation" });
    const name = view === "Orders" ? /Orders/ : view;
    await bottomNav.getByRole("button", { name }).click();
    return;
  }
  const name = view === "Settings" ? "Shop settings" : view === "Orders" ? /Orders/ : "Products";
  await vendorSidebar(page).getByRole("button", { name }).click();
}

async function signIn(page: Page, email: string, password: string) {
  await fillHydrated(page, page.getByLabel("Email address"), email);
  await fillHydrated(page, page.getByLabel("Password", { exact: true }), password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

// Cleanup runs in a `finally`; keep each call short so a failed or timed-out
// test surfaces its real error instead of hanging for the full test timeout.
const CLEANUP_REQUEST_TIMEOUT_MS = 5_000;

async function vendorBootstrap(page: Page): Promise<VendorBootstrap> {
  const response = await page.request.get("/api/vendor/bootstrap");
  expect(response.ok()).toBe(true);
  return response.json() as Promise<VendorBootstrap>;
}

async function cleanupCreatedRecords(
  page: Page,
  origin: string,
  productName: string,
  idempotencyKey: string,
) {
  const requestOptions = { timeout: CLEANUP_REQUEST_TIMEOUT_MS };
  const bootstrapResponse = await page.request.get(
    "/api/vendor/bootstrap",
    requestOptions,
  );
  if (!bootstrapResponse.ok()) {
    throw new Error(
      `Cleanup could not load vendor bootstrap (HTTP ${bootstrapResponse.status()}).`,
    );
  }

  let bootstrap = (await bootstrapResponse.json()) as VendorBootstrap;
  const order = bootstrap.orders.find(
    (candidate) => candidate.idempotencyKey === idempotencyKey,
  );
  if (order && order.status !== "completed" && order.status !== "cancelled") {
    const cancelled = await page.request.patch(
      `/api/vendor/orders/${encodeURIComponent(order.id)}`,
      {
        ...requestOptions,
        headers: { origin },
        data: { status: "cancelled", version: order.version },
      },
    );
    if (!cancelled.ok()) {
      throw new Error(`Cleanup could not cancel order (HTTP ${cancelled.status()}).`);
    }
    const refreshed = await page.request.get(
      "/api/vendor/bootstrap",
      requestOptions,
    );
    if (refreshed.ok()) bootstrap = (await refreshed.json()) as VendorBootstrap;
  }

  const product = bootstrap.products.find(
    (candidate) => candidate.name === productName,
  );
  if (product) {
    const deleted = await page.request.delete(
      `/api/vendor/products/${encodeURIComponent(product.id)}`,
      {
        ...requestOptions,
        headers: { origin },
        data: { version: product.version },
      },
    );
    if (!deleted.ok()) {
      throw new Error(`Cleanup could not delete product (HTTP ${deleted.status()}).`);
    }
  }
}

test("public vendor login and mobile sign-out keep the studio protected", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const welcomeActions = page.locator(".welcome-actions");
  await expect(
    welcomeActions.getByRole("link", { name: "Vendor login" }),
  ).toBeVisible();
  await welcomeActions.getByRole("link", { name: "Vendor login" }).click();
  await expect(page).toHaveURL(/\/vendor\/login$/);
  await expect(page.getByRole("link", { name: "Back to kiosk" })).toBeVisible();

  await signIn(page, VENDOR_EMAIL, VENDOR_PASSWORD);
  await expect(page).toHaveURL(/\/vendor\/chapega$/);

  const menuButton = page.getByRole("button", { name: "Open navigation" });
  await menuButton.click();
  await expect(
    vendorSidebar(page).getByRole("button", { name: "Close navigation" }),
  ).toBeFocused();
  await expect(
    vendorSidebar(page).getByRole("button", { name: "Sign out of Vendor Studio" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuButton).toBeFocused();

  const topbarSignOut = page
    .locator(".vendor-topbar")
    .getByRole("button", { name: "Sign out of Vendor Studio" });
  await expect(topbarSignOut).toBeVisible();
  await page.route("**/api/vendor/logout", (route) => route.abort("failed"));
  await topbarSignOut.click();
  await expect(page).toHaveURL(/\/vendor\/chapega$/);
  await expect(
    page.getByText("Could not sign out. Check the connection and try again."),
  ).toBeVisible();
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "chapega_vendor_session",
    ),
  ).toBe(true);
  await page.unroute("**/api/vendor/logout");
  await topbarSignOut.click();
  // Signing out keeps the shop so the login page offers the same workspace.
  await expect(page).toHaveURL(/\/vendor\/login\?vendor=chapega$/);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === "chapega_vendor_session",
    ),
  ).toBe(false);

  await page.goto("/vendor");
  await expect(page).toHaveURL(/\/vendor\/login$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Welcome back,/ })).toHaveCount(0);
});

test("vendor signs in, publishes a product, receives an order, and cleans up", async ({
  page,
  context,
  baseURL,
  browserName,
}) => {
  let testBodyFailed = false;
  const origin = new URL(baseURL ?? "http://localhost:3000").origin;
  const runId = Date.now().toString(36);
  const productName = `E2E Keepsake ${runId}`;
  const idempotencyKey = `vendor-e2e-${runId}`;

  await test.step("protect the vendor route and validate credentials", async () => {
    await page.goto("/vendor");
    await expect(page).toHaveURL(/\/vendor\/login$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await signIn(page, `missing-${runId}@chapega.com`, "DefinitelyWrong!2026");
    await expect(page.locator(".vendor-form-error")).toHaveText(
      "The email or password is incorrect.",
    );

    const loginResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/vendor/login") &&
        response.request().method() === "POST" &&
        response.ok(),
    );
    await signIn(page, VENDOR_EMAIL, VENDOR_PASSWORD);
    const setCookie = (await (await loginResponse).headersArray())
      .filter((header) => header.name.toLowerCase() === "set-cookie")
      .map((header) => header.value)
      .find((value) => value.startsWith("chapega_vendor_session="));
    // The server contract: the session cookie is HttpOnly + SameSite=Strict.
    // This is asserted on the raw response header in every browser.
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*SameSite=Strict/i);
    await expect(page).toHaveURL(/\/vendor\/chapega$/);
    await expect(
      page.getByRole("heading", { name: /Welcome back,/ }),
    ).toBeVisible();
    await expect(page.getByText("Studio overview")).toHaveCount(0);

    const sessionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "chapega_vendor_session",
    );
    expect(sessionCookie).toMatchObject({ httpOnly: true, path: "/" });
    // Playwright-WebKit reports "None" for SameSite=Strict cookies set on
    // http://localhost even though the header above proves the server sent
    // Strict, so the cookie-jar attribute is only asserted on the engines that
    // report it faithfully.
    if (browserName !== "webkit") {
      expect(sessionCookie?.sameSite).toBe("Strict");
    }
  });

  try {
    await test.step("publish a product with an uploaded PNG", async () => {
      await openVendorView(page, "Products");
      await expect(
        page.getByRole("heading", { name: "Products", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Add product" }).first().click();

      const editor = page.getByRole("dialog", { name: "Add a new product" });
      await expect(editor).toBeVisible();
      await editor.locator('input[type="file"]').setInputFiles(PRODUCT_IMAGE);
      await editor.getByLabel("Name", { exact: true }).fill(productName);
      await editor
        .getByLabel("Short description")
        .fill("A polished keepsake created by the vendor E2E flow.");
      await editor
        .getByLabel("Full description")
        .fill("A premium personalised keepsake used to verify vendor catalogue publishing and kiosk synchronisation.");
      await editor.getByLabel("Category").fill("Personalized Gifts");
      await editor.getByLabel("Price (₹)", { exact: true }).fill("849");
      await editor.getByLabel("Compare-at price (₹)").fill("999");
      await editor.getByLabel("Stock quantity").fill("7");
      await editor
        .getByLabel("Preparation note")
        .fill("Ready in one business day");
      await editor.getByLabel("Search tags").fill("e2e, keepsake, premium");
      await editor.getByLabel("Occasions").fill("Birthday");
      await editor.getByLabel("Recipients").fill("For Her");
      await editor.getByRole("button", { name: "Save product" }).click();

      await expect(editor).toBeHidden();
      await expect(
        page.getByText("Product added to the kiosk catalogue."),
      ).toBeVisible();
      await page.getByPlaceholder("Search products").fill(productName);
      const productRow = page.getByRole("row").filter({ hasText: productName });
      await expect(productRow).toBeVisible();
      await expect(productRow.getByText("In stock · 7")).toBeVisible();
      await expect(
        productRow.getByRole("checkbox", {
          name: `Hide ${productName} on kiosk`,
        }),
      ).toBeChecked();
    });

    const created = (await vendorBootstrap(page)).products.find(
      (product) => product.name === productName,
    );
    expect(created).toBeDefined();

    await test.step("clear an optional comparison price", async () => {
      const productRow = page.getByRole("row").filter({ hasText: productName });
      await productRow
        .getByRole("button", { name: `Edit ${productName}` })
        .click();
      const editor = page.getByRole("dialog", { name: "Edit product" });
      const compareAtPrice = editor.getByLabel("Compare-at price (₹)");
      await expect(compareAtPrice).toHaveValue("999");
      await compareAtPrice.fill("");
      await editor.getByRole("button", { name: "Save changes" }).click();
      await expect(editor).toBeHidden();
      await expect(page.getByText("Product changes published.")).toBeVisible();

      const updated = (await vendorBootstrap(page)).products.find(
        (product) => product.id === created!.id,
      );
      expect(updated).not.toHaveProperty("compareAtPricePaise");

      const kioskResponse = await page.request.get("/api/kiosk/bootstrap");
      expect(kioskResponse.ok()).toBe(true);
      const kioskBootstrap = (await kioskResponse.json()) as {
        products: VendorProduct[];
      };
      const kioskProduct = kioskBootstrap.products.find(
        (product) => product.id === created!.id,
      );
      expect(kioskProduct).toBeDefined();
      expect(kioskProduct).not.toHaveProperty("compareAtPricePaise");
    });

    await test.step("show the published product in the customer kiosk", async () => {
      const kioskPage = await context.newPage();
      await kioskPage.goto("/");
      await expect(
        kioskPage.getByRole("heading", { name: "Find the Perfect Gift" }),
      ).toBeVisible();
      await kioskPage.getByRole("button", { name: /Start Shopping/i }).click();
      await expect(
        kioskPage.getByRole("heading", { name: "Find a gift worth keeping" }),
      ).toBeVisible();
      await kioskPage.getByRole("searchbox", { name: "Search gifts" }).fill(productName);
      const kioskCard = kioskPage.locator("article.product-card").filter({
        has: kioskPage.getByRole("heading", { name: productName }),
      });
      await expect(kioskCard).toBeVisible();
      await expect(kioskCard.getByText("₹849.00")).toBeVisible();
      await expect(kioskCard.getByText("₹999.00")).toHaveCount(0);
      await expect(kioskCard.locator("del")).toHaveCount(0);
      await expect(
        kioskCard.getByRole("button", { name: `Quick add ${productName}` }),
      ).toBeEnabled();
      await kioskPage.close();
    });

    const beforeOrder = await vendorBootstrap(page);

    await test.step("receive, confirm, and cancel a kiosk order", async () => {
      const orderResponse = await page.request.post("/api/kiosk/orders", {
        headers: { origin },
        data: {
          idempotencyKey,
          kioskName: beforeOrder.settings.kioskName,
          customer: {
            customerName: "E2E Vendor Customer",
            customerPhone: "9876543210",
            giftNote: "Test snapshot",
            orderNote: "Vendor workflow verification",
          },
          items: [
            {
              productId: created!.id,
              quantity: 1,
              giftWrapped: false,
            },
          ],
        },
      });
      expect(orderResponse.status()).toBe(201);
      const preparedOrder = ((await orderResponse.json()) as {
        order: VendorOrder;
      }).order;
      // The server assigns the display number; use the one it returned.
      const orderNumber = preparedOrder.orderNumber;
      expect(orderNumber).toMatch(/^GFT-\d{8}-\d{4,6}$/);
      expect(preparedOrder).toMatchObject({
        status: "prepared",
        inventoryCommitted: false,
      });
      expect(preparedOrder.events).toMatchObject([
        {
          from: null,
          to: "prepared",
          actorName: `Kiosk · ${beforeOrder.settings.kioskName}`,
          note: "WhatsApp message prepared; sending is not yet verified.",
        },
      ]);

      await page.getByRole("button", { name: "Refresh vendor data" }).click();
      await openVendorView(page, "Orders");
      await page
        .getByPlaceholder("Search number, customer, or gift")
        .fill(orderNumber);
      const orderListItem = page.locator(".vendor-order-list li").filter({
        hasText: orderNumber,
      });
      await expect(orderListItem).toBeVisible();
      await orderListItem.getByRole("button").click();

      const orderDetail = page.locator(".vendor-order-detail");
      await expect(orderDetail.getByRole("heading", { name: orderNumber })).toBeVisible();
      await expect(orderDetail.getByText("E2E Vendor Customer")).toBeVisible();
      await expect(orderDetail.getByText(productName)).toBeVisible();
      await expect(orderDetail.getByText("Prepared does not mean sent.")).toBeVisible();
      const timelineItems = orderDetail.locator(".vendor-order-timeline li");
      await expect(timelineItems).toHaveCount(1);
      await expect(timelineItems.first()).toContainText("Prepared on kiosk");
      await expect(timelineItems.first()).toContainText(
        `Kiosk · ${beforeOrder.settings.kioskName}`,
      );

      await orderDetail.getByRole("button", { name: "Confirm order" }).click();
      await expect(
        orderDetail
          .locator(".vendor-order-detail-header")
          .getByText("Confirmed", { exact: true }),
      ).toBeVisible();

      const afterConfirmation = await vendorBootstrap(page);
      expect(
        afterConfirmation.products.find((product) => product.id === created!.id),
      ).toMatchObject({ stock: 6 });
      const confirmedOrder = afterConfirmation.orders.find(
        (order) => order.idempotencyKey === idempotencyKey,
      );
      expect(confirmedOrder).toMatchObject({
        id: preparedOrder.id,
        status: "confirmed",
        inventoryCommitted: true,
      });
      expect(
        confirmedOrder?.events.map(({ from, to, actorName }) => ({
          from,
          to,
          actorName,
        })),
      ).toEqual([
        {
          from: null,
          to: "prepared",
          actorName: `Kiosk · ${beforeOrder.settings.kioskName}`,
        },
        { from: "prepared", to: "confirmed", actorName: VENDOR_NAME },
      ]);
      await expect(timelineItems).toHaveCount(2);
      await expect(timelineItems.nth(0)).toContainText("Confirmed");
      await expect(timelineItems.nth(0)).toContainText(VENDOR_NAME);
      await expect(timelineItems.nth(1)).toContainText("Prepared on kiosk");

      await orderDetail.getByRole("button", { name: "Cancel order" }).click();
      await orderDetail
        .getByRole("button", { name: "Confirm cancellation" })
        .click();
      await page.getByRole("button", { name: /All orders/ }).click();
      await expect(
        orderDetail
          .locator(".vendor-order-detail-header")
          .getByText("Cancelled", { exact: true }),
      ).toBeVisible();

      const afterCancellation = await vendorBootstrap(page);
      expect(
        afterCancellation.products.find((product) => product.id === created!.id),
      ).toMatchObject({ stock: 7 });
      const cancelledOrder = afterCancellation.orders.find(
        (order) => order.idempotencyKey === idempotencyKey,
      );
      expect(cancelledOrder).toMatchObject({
        id: preparedOrder.id,
        status: "cancelled",
        inventoryCommitted: false,
      });
      expect(
        cancelledOrder?.events.map(({ from, to, actorName }) => ({
          from,
          to,
          actorName,
        })),
      ).toEqual([
        {
          from: null,
          to: "prepared",
          actorName: `Kiosk · ${beforeOrder.settings.kioskName}`,
        },
        { from: "prepared", to: "confirmed", actorName: VENDOR_NAME },
        { from: "confirmed", to: "cancelled", actorName: VENDOR_NAME },
      ]);
      await expect(timelineItems).toHaveCount(3);
      await expect(timelineItems.nth(0)).toContainText("Cancelled");
      await expect(timelineItems.nth(0)).toContainText(VENDOR_NAME);
      await expect(timelineItems.nth(1)).toContainText("Confirmed");
      await expect(timelineItems.nth(2)).toContainText("Prepared on kiosk");
    });

    await test.step("open settings and archive the test product", async () => {
      await openVendorView(page, "Settings");
      await expect(
        page.getByRole("heading", { name: "Store profile" }),
      ).toBeVisible();
      await expect(page.getByLabel("Accept kiosk orders")).toBeChecked();
      await expect(page.getByLabel("Owner WhatsApp number")).toHaveValue(
        beforeOrder.settings.ownerWhatsAppNumber,
      );
      await expect(
        page.getByRole("button", { name: "Publish settings" }),
      ).toBeDisabled();

      await openVendorView(page, "Products");
      await page.getByPlaceholder("Search products").fill(productName);
      const row = page.getByRole("row").filter({ hasText: productName });
      await row
        .getByRole("button", { name: `Edit ${productName}` })
        .click();
      const editor = page.getByRole("dialog", { name: "Edit product" });
      await editor.getByRole("button", { name: "Archive", exact: true }).click();
      await editor.getByRole("button", { name: "Confirm archive" }).click();
      await expect(editor).toBeHidden();
      await expect(
        page.getByText("Product archived. Past order snapshots remain unchanged."),
      ).toBeVisible();
      await expect(page.getByText("No products match")).toBeVisible();

      const kioskResponse = await page.request.get("/api/kiosk/bootstrap");
      expect(kioskResponse.ok()).toBe(true);
      const kioskBootstrap = (await kioskResponse.json()) as {
        products: VendorProduct[];
      };
      expect(
        kioskBootstrap.products.some((product) => product.name === productName),
      ).toBe(false);
    });
  } catch (error) {
    testBodyFailed = true;
    throw error;
  } finally {
    try {
      await cleanupCreatedRecords(
        page,
        origin,
        productName,
        idempotencyKey,
      );
    } catch (cleanupError) {
      // Never let a cleanup failure mask the real test failure.
      if (!testBodyFailed) throw cleanupError;
      console.warn("E2E cleanup failed:", cleanupError);
    }
  }

  await test.step("sign out and revoke the protected session", async () => {
    // The topbar button is visible on both desktop and mobile layouts.
    await page
      .locator(".vendor-topbar")
      .getByRole("button", { name: "Sign out of Vendor Studio" })
      .click();
    await expect(page).toHaveURL(/\/vendor\/login\?vendor=chapega$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === "chapega_vendor_session",
      ),
    ).toBe(false);
    const protectedResponse = await page.request.get("/api/vendor/bootstrap");
    expect(protectedResponse.status()).toBe(401);
  });
});
