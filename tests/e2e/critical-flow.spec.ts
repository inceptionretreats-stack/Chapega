import { expect, test } from "@playwright/test";

const PRESENTER_SETTINGS_KEY = "gift-kiosk-presenter-settings";
const ACTIVE_SESSION_KEY = "gift-kiosk-active-session";
const ORDER_HISTORY_KEY = "gift-kiosk-orders";
const VENDOR_EMAIL = process.env.VENDOR_EMAIL ?? "owner@chapega.com";
const VENDOR_PASSWORD = process.env.VENDOR_PASSWORD ?? "Chapega@2026";

type SubmittedKioskOrder = {
  idempotencyKey: string;
  orderNumber: string;
};

type CreatedVendorOrder = SubmittedKioskOrder & {
  id: string;
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ settingsKey, sessionKey, historyKey }) => {
      localStorage.removeItem(settingsKey);
      localStorage.removeItem(historyKey);
      sessionStorage.removeItem(sessionKey);
    },
    {
      settingsKey: PRESENTER_SETTINGS_KEY,
      sessionKey: ACTIVE_SESSION_KEY,
      historyKey: ORDER_HISTORY_KEY,
    },
  );
});

test("stale kiosk sessions discard customer details before rendering", async ({ page }) => {
  await page.addInitScript(
    ({ sessionKey }) => {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        version: 2,
        lastActivityAt: Date.now() - 10 * 60 * 1_000,
        screen: "customer",
        searchQuery: "",
        selectedCategory: "all",
        selectedProductId: null,
        cartItems: [],
        customer: {
          customerName: "Private Customer",
          customerPhone: "9876543210",
          giftNote: "Private note",
          orderNote: "",
        },
        currentOrder: null,
        countdownSeconds: 120,
      }));
    },
    { sessionKey: ACTIVE_SESSION_KEY },
  );

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Find the Perfect Gift" })).toBeVisible();
  await expect(page.getByText("Private Customer")).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), ACTIVE_SESSION_KEY)).toBeNull();
});

test("customer completes the kiosk WhatsApp QR handoff and starts a clean order", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Find the Perfect Gift" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Start Shopping/i }).click();
  await expect(page.getByRole("heading", { name: /Our products/i })).toBeVisible();

  const productCard = page.locator("article.product-card").filter({
    has: page.getByRole("heading", {
      name: "10x10 Black Hamper Box",
    }),
  });
  const quickAdd = productCard.getByRole("button", {
    name: /^(?:Quick add|Add another) 10x10 Black Hamper Box/,
  });
  await expect(quickAdd).toBeEnabled();

  for (let unit = 1; unit <= 5; unit += 1) {
    await quickAdd.click();
  }

  // At <= 900px (see app/atelier.css) the desktop cart rail is hidden and
  // replaced by a bottom dock reading "5 / 5 gifts"; assert whichever element
  // is the visible one for this viewport.
  const compactViewport = (page.viewportSize()?.width ?? 1280) <= 900;
  const cartSummary = page.getByLabel("Cart summary");
  const mobileDock = page.getByRole("button", { name: /^Cart · 5 \/ 5/ });
  const expectFiveOfFive = async () => {
    if (compactViewport) {
      await expect(cartSummary).toBeHidden();
      await expect(mobileDock).toBeVisible();
      await expect(mobileDock.getByText(/^5 \/ 5 gifts/)).toBeVisible();
    } else {
      await expect(mobileDock).toBeHidden();
      await expect(cartSummary.getByText("5 of 5 gifts selected")).toBeVisible();
    }
  };
  await expectFiveOfFive();
  const sixthProductCard = page.locator("article.product-card").filter({
    has: page.getByRole("heading", { name: "8x8 Decorated Hamper Box" }),
  });
  await sixthProductCard
    .getByRole("button", { name: "Quick add 8x8 Decorated Hamper Box" })
    .click();
  await expect(page.getByText(/maximum of 5 gifts/i)).toBeVisible();
  await expectFiveOfFive();

  if (compactViewport) {
    await mobileDock.click();
  } else {
    await cartSummary.getByRole("button", { name: "Review cart" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Review your gifts" }),
  ).toBeVisible();
  await expect(
    page.getByText("5 of 5 gifts selected", { exact: true }),
  ).toBeVisible();
  const quantity = page.getByLabel("Quantity for 10x10 Black Hamper Box");
  await quantity.getByRole("button", { name: "Decrease quantity" }).click();
  await expect(quantity.getByText("4", { exact: true })).toBeVisible();
  await quantity.getByRole("button", { name: "Increase quantity" }).click();
  await expect(quantity.getByText("5", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Continue to Pay Later" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A few optional details" }),
  ).toBeVisible();
  await page.getByLabel(/First name/i).fill("Test Customer");
  await page.getByLabel(/Mobile number/i).fill("123");
  await page.getByLabel(/Order note/i).fill("Approval flow test");
  await page.getByRole("button", { name: "Review Order" }).click();
  await expect(page.getByText(/7 to 15 digits/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A few optional details" }),
  ).toBeVisible();
  await page.getByLabel(/Mobile number/i).fill("98765 43210");
  await page.getByRole("button", { name: "Review Order" }).click();

  await expect(
    page.getByRole("heading", { name: "Review before creating the QR" }),
  ).toBeVisible();
  await expect(page.getByText("Pay at Counter", { exact: true })).toBeVisible();

  const submittedOrders: SubmittedKioskOrder[] = [];
  const returnedOrders: CreatedVendorOrder[] = [];
  await page.route("**/api/kiosk/orders", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    submittedOrders.push(
      route.request().postDataJSON() as SubmittedKioskOrder,
    );
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    const payload = (await response.json()) as { order: CreatedVendorOrder };
    returnedOrders.push(payload.order);

    if (submittedOrders.length === 1) {
      // The server has committed the order, but the browser never receives the
      // response. Retrying must reuse the pending order's idempotency key.
      await route.abort("failed");
      return;
    }

    await route.fulfill({ response });
  });

  const prepareOrder = page.getByRole("button", {
    name: /Prepare WhatsApp QR|Create Order.*Show QR|Generate.*QR/i,
  });
  await prepareOrder.click();
  await expect(
    page.getByText(/We could not prepare this order:/i),
  ).toBeVisible();
  await expect(prepareOrder).toBeEnabled();
  expect(submittedOrders).toHaveLength(1);
  expect(returnedOrders).toHaveLength(1);

  await prepareOrder.click();

  await expect(
    page.getByRole("heading", { name: "Your order is ready to send" }),
  ).toBeVisible();
  await page.unroute("**/api/kiosk/orders");
  expect(submittedOrders).toHaveLength(2);
  expect(submittedOrders[1]).toEqual(submittedOrders[0]);
  expect(returnedOrders).toHaveLength(2);
  expect(returnedOrders[1]).toMatchObject({
    id: returnedOrders[0].id,
    idempotencyKey: returnedOrders[0].idempotencyKey,
    orderNumber: returnedOrders[0].orderNumber,
  });

  const orderNumberElement = page.getByText(
    /^GFT-\d{8}-\d{4,6}$/,
  );
  await expect(orderNumberElement).toBeVisible();
  const orderNumber = (await orderNumberElement.textContent())?.trim();
  expect(orderNumber).toMatch(/^GFT-\d{8}-\d{4,6}$/);

  const qr = page.getByTestId("whatsapp-qr");
  await expect(qr).toBeVisible();
  await expect(qr.locator("svg")).toBeVisible();

  const openWhatsApp = page.getByRole("link", { name: /Open WhatsApp/i });
  await expect(openWhatsApp).toBeVisible();
  const href = await openWhatsApp.getAttribute("href");
  expect(href).not.toBeNull();
  const whatsappUrl = new URL(href!);
  expect(whatsappUrl.origin).toBe("https://wa.me");
  expect(whatsappUrl.pathname).toBe("/919876543210");
  const preparedMessage = whatsappUrl.searchParams.get("text");
  expect(preparedMessage).toContain(`Order: ${orderNumber}`);
  expect(preparedMessage).toContain("Payment: Pay at Counter");
  expect(preparedMessage).toContain("Customer: Test Customer");
  expect(preparedMessage).toContain("10x10 Black Hamper Box × 5");
  expect(preparedMessage).toContain("Total: ₹3,495.00");

  const origin = new URL(baseURL ?? "http://localhost:3100").origin;
  const loginResponse = await page.request.post("/api/vendor/login", {
    headers: { origin },
    data: { email: VENDOR_EMAIL, password: VENDOR_PASSWORD },
  });
  expect(loginResponse.ok()).toBe(true);
  const bootstrapResponse = await page.request.get("/api/vendor/bootstrap");
  expect(bootstrapResponse.ok()).toBe(true);
  const vendorBootstrap = (await bootstrapResponse.json()) as {
    orders: CreatedVendorOrder[];
  };
  const matchingOrders = vendorBootstrap.orders.filter(
    (order) => order.idempotencyKey === submittedOrders[0].idempotencyKey,
  );
  expect(matchingOrders).toHaveLength(1);
  expect(matchingOrders[0]).toMatchObject(returnedOrders[0]);
  const logoutResponse = await page.request.post("/api/vendor/logout", {
    headers: { origin },
  });
  expect(logoutResponse.ok()).toBe(true);

  await page.getByRole("button", { name: "Start new order" }).click();
  // Starting over asks first, so a stray tap cannot wipe the customer's QR.
  const startOver = page.getByRole("alertdialog", { name: "Start a new order?" });
  await expect(startOver.getByRole("button", { name: "Keep this QR" })).toBeFocused();
  await startOver.getByRole("button", { name: "Start new order" }).click();
  await expect(
    page.getByRole("heading", { name: "Find the Perfect Gift" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (sessionKey) => sessionStorage.getItem(sessionKey),
      ACTIVE_SESSION_KEY,
    ),
  ).toBeNull();

  await page.getByRole("button", { name: /Start Shopping/i }).click();
  await expect(
    page.getByRole("button", { name: "Open cart, 0 of 5 gifts selected" }),
  ).toBeVisible();
  await expect(page.getByLabel("Cart summary")).toHaveCount(0);
});

test("mobile screen changes return the next heading to the top of the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Start Shopping/i }).click();

  const productCard = page.locator("article.product-card").filter({
    has: page.getByRole("heading", { name: "10x10 Black Hamper Box" }),
  });
  await productCard
    .getByRole("button", { name: "Quick add 10x10 Black Hamper Box" })
    .click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.getByRole("button", { name: /Cart · 1 \/ 5/i }).click();
  await expect(page.getByRole("heading", { name: "Review your gifts" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "Continue to Pay Later" }).click();
  await expect(page.getByRole("heading", { name: "A few optional details" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "Review Order" }).click();
  await expect(
    page.getByRole("heading", { name: "Review before creating the QR" }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "Prepare WhatsApp QR" }).click();
  await expect(
    page.getByRole("heading", { name: "Your order is ready to send" }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.textContent?.trim()))
    .toBe("Your order is ready to send");
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.getByRole("button", { name: "Copy message" }).click();
  await expect(page.getByRole("button", { name: "Message copied" })).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0);

  const qrBox = await page.getByTestId("whatsapp-qr").boundingBox();
  const detailsBox = await page.locator(".order-ready-copy").boundingBox();
  expect(qrBox).not.toBeNull();
  expect(detailsBox).not.toBeNull();
  expect(qrBox!.y).toBeLessThan(detailsBox!.y);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Vendor login" }).click();
  await expect(page).toHaveURL(/\/vendor\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
