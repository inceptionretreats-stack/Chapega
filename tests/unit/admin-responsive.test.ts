import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("platform administrator responsive contract", () => {
  it("keeps the mobile metrics, vendor cards, and bottom navigation breakpoint", async () => {
    const css = await readFile("app/admin/admin.css", "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(mobile).toMatch(
      /\.admin-metric-band\s*\{[^}]*grid-template-columns:\s*repeat\(2,/,
    );
    expect(mobile).toMatch(/\.admin-vendor-table-wrap\s*\{[^}]*display:\s*none/);
    expect(mobile).toMatch(/\.admin-vendor-list\s*\{[^}]*display:/);
    const bottomNavigation = mobile.match(/\.admin-bottom-nav\s*\{([^}]*)\}/)?.[1];
    expect(bottomNavigation).toMatch(/position:\s*fixed/);
    expect(bottomNavigation).toMatch(/grid-template-columns:\s*repeat\(4,/);
  });
});
