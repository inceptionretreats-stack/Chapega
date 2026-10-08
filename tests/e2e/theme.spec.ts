import { expect, test, type Page } from "@playwright/test";

async function canvas(page: Page) {
  return page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
}

async function look(page: Page, path: string, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(path);
  await page.waitForLoadState("load");
  return canvas(page);
}

test("the public kiosk stays light on a device set to dark mode", async ({ page }) => {
  const light = await look(page, "/", "light");
  const dark = await look(page, "/", "dark");
  expect(dark).toEqual(light);
  expect(dark.scheme).toBe("light");

  const privacyLight = await look(page, "/privacy", "light");
  expect(await look(page, "/privacy", "dark")).toEqual(privacyLight);
});

for (const path of ["/vendor/login", "/admin/login"]) {
  test(`${path} follows a device set to dark mode`, async ({ page }) => {
    const light = await look(page, path, "light");
    const dark = await look(page, path, "dark");
    expect(dark.background).not.toBe(light.background);
    expect(dark.scheme).toBe("dark");
  });
}
