import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOGUE_CATEGORIES,
  CATALOGUE_PRODUCTS,
  getProductById,
  getProductsByCategory,
} from "@/data/catalogue";

describe("supplied product catalogue", () => {
  it("contains the 24 products extracted from the supplied screenshots", () => {
    expect(CATALOGUE_PRODUCTS).toHaveLength(24);
    expect(CATALOGUE_CATEGORIES).toEqual([
      "Gift Hampers",
      "Personalized Gifts",
      "Photo Frames",
      "Resin Art",
      "Varmala Preservation",
    ]);
  });

  it("uses unique identifiers and existing local product images", () => {
    const ids = CATALOGUE_PRODUCTS.map((product) => product.id);
    const images = CATALOGUE_PRODUCTS.map((product) => product.image);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(images).size).toBe(images.length);

    for (const product of CATALOGUE_PRODUCTS) {
      expect(getProductById(product.id)).toBe(product);
      expect(product.pricePaise).toBeGreaterThan(0);
      expect(product.stock).toBe(5);
      expect(
        existsSync(
          join(process.cwd(), "public", product.image.replace(/^\/products\//, "products/")),
        ),
      ).toBe(true);
    }
  });

  it("derives each category listing from the same catalogue", () => {
    for (const category of CATALOGUE_CATEGORIES) {
      const categoryProducts = getProductsByCategory(category);
      expect(categoryProducts.length).toBeGreaterThan(0);
      expect(categoryProducts.every((product) => product.category === category)).toBe(true);
    }
  });
});
