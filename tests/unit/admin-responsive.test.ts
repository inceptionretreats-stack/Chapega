import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function mediaBlock(css: string, query: string): string {
  const start = css.indexOf(`@media (${query})`);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated @media (${query})`);
}

describe("tablet overflow contract (AUD-23)", () => {
  it("collapses the admin content grid with a shrinkable track and min-width:0 children", async () => {
    const css = await readFile("app/admin/admin.css", "utf8");
    const tablet = mediaBlock(css, "max-width: 1100px");
    expect(tablet).toMatch(
      /\.admin-content-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(/\.admin-content-grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.admin-vendor-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
    // Absolutely positioned .sr-only header text must be clipped by the wrapper.
    expect(css).toMatch(/\.admin-vendor-table-wrap\s*\{[^}]*position:\s*relative/);
  });

  it("collapses the vendor dashboard grid with a shrinkable track and min-width:0 children", async () => {
    const css = await readFile("app/vendor/vendor.css", "utf8");
    const tablet = mediaBlock(css, "max-width: 1000px");
    expect(tablet).toMatch(
      /\.vendor-dashboard-grid[^{]*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(/\.vendor-dashboard-grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.vendor-table-wrap\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.vendor-table-wrap\s*\{[^}]*position:\s*relative/);
  });
});

describe("platform administrator responsive contract", () => {
  it("keeps the mobile metrics, vendor cards, and bottom navigation breakpoint", async () => {
    const css = await readFile("app/admin/admin.css", "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(mobile).toMatch(/\.admin-metric-band\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
    expect(mobile).toMatch(/\.admin-vendor-table-wrap\s*\{[^}]*display:\s*none/);
    expect(mobile).toMatch(/\.admin-vendor-list\s*\{[^}]*display:/);
    const bottomNavigation = mobile.match(/\.admin-bottom-nav\s*\{([^}]*)\}/)?.[1];
    expect(bottomNavigation).toMatch(/position:\s*fixed/);
    expect(bottomNavigation).toMatch(/grid-template-columns:\s*repeat\(4,/);
  });
});
