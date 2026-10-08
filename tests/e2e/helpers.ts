import { expect, type Locator, type Page } from "@playwright/test";

/** Mirrors the (max-width: 820px) media query that switches the vendor studio to its mobile layout. */
export const VENDOR_MOBILE_MAX_WIDTH = 820;

export function isVendorMobileLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= VENDOR_MOBILE_MAX_WIDTH;
}

/**
 * Resolves once React has attached its fibre to the element, i.e. the page is
 * hydrated and controlled inputs will keep what is typed into them. Filling a
 * server-rendered input before this point lets hydration reset its value.
 */
export async function waitForHydration(page: Page, locator: Locator): Promise<void> {
  const handle = await locator.elementHandle();
  if (!handle) throw new Error("Cannot wait for hydration: element not found.");
  await page.waitForFunction(
    (element) =>
      Object.keys(element).some(
        (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactProps$"),
      ),
    handle,
  );
}

/** Fill a controlled input only after hydration, and confirm the value stuck. */
export async function fillHydrated(page: Page, locator: Locator, value: string): Promise<void> {
  await waitForHydration(page, locator);
  await locator.fill(value);
  await expect(locator).toHaveValue(value);
}
