import { expect, test, type Page } from "@playwright/test";

const PRESENTER_SETTINGS_KEY = "gift-kiosk-presenter-settings";
const ACTIVE_SESSION_KEY = "gift-kiosk-active-session";

async function seedKiosk(page: Page) {
  await page.addInitScript(
    ({ settingsKey, sessionKey }) => {
      localStorage.removeItem(settingsKey);
      sessionStorage.removeItem(sessionKey);
    },
    {
      settingsKey: PRESENTER_SETTINGS_KEY,
      sessionKey: ACTIVE_SESSION_KEY,
    },
  );
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function expectInViewport(page: Page, selector: string) {
  await expect
    .poll(() =>
      page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= window.innerHeight;
      }),
    )
    .toBe(true);
}

async function addFirstGift(page: Page) {
  const product = page.locator("article.product-card").first();
  await product.getByRole("button", { name: /Quick add/i }).click();
}

test.describe("1366 × 768 landscape kiosk", () => {
  test.use({ viewport: { width: 1366, height: 768 }, hasTouch: true });

  test("keeps the shopping and QR actions inside the active viewport", async ({ page }) => {
    await seedKiosk(page);
    await page.goto("/");
    await expectNoPageOverflow(page);
    await expectInViewport(page, ".welcome-footer");

    await page.getByRole("button", { name: /Start Shopping/i }).click();
    await expect(page.getByRole("heading", { name: /Our products/i })).toBeVisible();
    await expectInViewport(page, "article.product-card:first-of-type .quick-button");

    const quickAddBox = await page
      .locator("article.product-card:first-of-type .quick-button")
      .boundingBox();
    expect(quickAddBox?.height).toBeGreaterThanOrEqual(48);
    await addFirstGift(page);

    const cartSummary = page.getByLabel("Cart summary");
    await expect(cartSummary).toBeVisible();
    await cartSummary.getByRole("button", { name: "Review cart" }).click();
    await page.getByRole("button", { name: "Continue to Pay Later" }).click();

    await expect(page.getByRole("heading", { name: "A few optional details" })).toBeVisible();
    await expectInViewport(page, ".checkout-form-actions .primary-button");
    await page.getByRole("button", { name: "Review Order" }).click();

    await expect(page.getByRole("heading", { name: "Review before creating the QR" })).toBeVisible();
    await expectInViewport(page, ".review-page .transaction-summary__actions .primary-button");
    await page.getByRole("button", { name: "Prepare WhatsApp QR" }).click();

    await expect(page.getByRole("heading", { name: "Your order is ready to send" })).toBeVisible();
    await expectInViewport(page, ".qr-card");
    await expectInViewport(page, ".order-ready-guidance__primary");
    await expectNoPageOverflow(page);
  });
});

test.describe("1080 × 1920 portrait kiosk", () => {
  test.use({ viewport: { width: 1080, height: 1920 }, hasTouch: true });

  test("uses the portrait welcome and compact selection dock", async ({ page }) => {
    await seedKiosk(page);
    await page.goto("/");
    await expectNoPageOverflow(page);
    await expectInViewport(page, ".welcome-footer");
    expect(
      await page.locator(".welcome-hero").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(1);

    await page.getByRole("button", { name: /Start Shopping/i }).click();
    await expect(page.getByRole("heading", { name: /Our products/i })).toBeVisible();
    expect(
      await page.locator(".product-grid").evaluate((element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(3);

    await addFirstGift(page);
    await expect(page.getByLabel("Cart summary")).toBeHidden();
    const portraitDock = page.getByRole("button", { name: /Cart · 1 \/ 5/i });
    await expect(portraitDock).toBeVisible();
    const dockBox = await portraitDock.boundingBox();
    expect(dockBox?.height).toBeGreaterThanOrEqual(72);
    await portraitDock.click();
    await expect(page.getByRole("heading", { name: "Review your gifts" })).toBeVisible();
    await expectNoPageOverflow(page);
  });
});

test.describe("800 × 1280 portrait kiosk", () => {
  test.use({ viewport: { width: 800, height: 1280 }, hasTouch: true });

  test("keeps the QR and primary handoff action together", async ({ page }) => {
    await seedKiosk(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Start Shopping/i }).click();
    await addFirstGift(page);
    await page.getByRole("button", { name: /Cart · 1 \/ 5/i }).click();
    await page.getByRole("button", { name: "Continue to Pay Later" }).click();
    await page.getByRole("button", { name: "Review Order" }).click();
    await page.getByRole("button", { name: "Prepare WhatsApp QR" }).click();

    await expect(page.getByRole("heading", { name: "Your order is ready to send" })).toBeVisible();
    await expectInViewport(page, ".qr-card");
    await expectInViewport(page, ".qr-actions .whatsapp-button");
    await expectNoPageOverflow(page);
  });
});

test("hydration keeps the server-rendered welcome screen and its hero image (AUD-24)", async ({ page }) => {
  await seedKiosk(page);
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { serverHero?: Element | null }).serverHero =
        document.querySelector(".welcome-visual img");
    });
  });
  await page.goto("/");
  // Enabled only once the kiosk store has hydrated and the live screen is up.
  await expect(page.getByRole("button", { name: /Start Shopping/ })).toBeEnabled();

  // A replaced <img> is a new LCP candidate that paints only after hydration.
  const kept = await page.evaluate(() => {
    const hero = (window as unknown as { serverHero?: Element | null }).serverHero;
    return Boolean(hero) && document.contains(hero ?? null);
  });
  expect(kept).toBe(true);
});
