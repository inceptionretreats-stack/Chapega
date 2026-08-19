import { expect, test } from "@playwright/test";

const PRESENTER_SETTINGS_KEY = "gift-kiosk-presenter-settings";
const ACTIVE_SESSION_KEY = "gift-kiosk-active-session";
const ORDER_HISTORY_KEY = "gift-kiosk-orders";

const presenterSettings = {
  shopName: "Chapega.com",
  ownerWhatsAppNumber: "919876543210",
  defaultCountryCode: "91",
  kioskName: "Approval Counter",
  maxCartQuantity: 5,
  giftWrapFeePaise: 2_500,
  qrResetSeconds: 3_600,
  showPreviewLabel: false,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ settingsKey, sessionKey, historyKey, settings }) => {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
      localStorage.removeItem(historyKey);
      sessionStorage.removeItem(sessionKey);
    },
    {
      settingsKey: PRESENTER_SETTINGS_KEY,
      sessionKey: ACTIVE_SESSION_KEY,
      historyKey: ORDER_HISTORY_KEY,
      settings: presenterSettings,
    },
  );
});

test("customer completes the kiosk WhatsApp QR handoff and starts a clean order", async ({
  page,
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
  const quickAdd = productCard.getByRole("button", { name: "Quick add" });
  await expect(quickAdd).toBeEnabled();

  for (let unit = 1; unit <= 5; unit += 1) {
    await quickAdd.click();
  }

  const cartSummary = page.getByLabel("Cart summary");
  await expect(cartSummary.getByText("5 of 5 gifts selected")).toBeVisible();
  const sixthProductCard = page.locator("article.product-card").filter({
    has: page.getByRole("heading", { name: "8x8 Decorated Hamper Box" }),
  });
  await sixthProductCard.getByRole("button", { name: "Quick add" }).click();
  await expect(page.getByText(/maximum of 5 gifts/i)).toBeVisible();
  await expect(cartSummary.getByText("5 of 5 gifts selected")).toBeVisible();

  await cartSummary.getByRole("button", { name: "Review cart" }).click();
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
  await page.getByLabel(/Order note/i).fill("Approval flow test");
  await page.getByRole("button", { name: "Review Order" }).click();

  await expect(
    page.getByRole("heading", { name: "Review before creating the QR" }),
  ).toBeVisible();
  await expect(page.getByText("Pay at Counter", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /Create Order.*Show QR|Generate.*QR/i })
    .click();

  await expect(
    page.getByRole("heading", { name: "Your order is ready to send" }),
  ).toBeVisible();
  const orderNumberElement = page.getByText(
    /^GFT-\d{8}-\d{4}$/,
  );
  await expect(orderNumberElement).toBeVisible();
  const orderNumber = (await orderNumberElement.textContent())?.trim();
  expect(orderNumber).toMatch(/^GFT-\d{8}-\d{4}$/);

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

  await page.getByRole("button", { name: "Start new order" }).click();
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
  await expect(page.getByLabel("Cart summary").getByText("0 of 5 gifts selected")).toBeVisible();
});
