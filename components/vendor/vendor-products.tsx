"use client";

import Image from "next/image";
import { Edit3, PackagePlus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { formatInr } from "@/domain/money";
import type { VendorProduct } from "@/types/vendor";
import { vendorRequest } from "./vendor-client";
import { VendorProductEditor } from "./vendor-product-editor";

type ProductsProps = {
  apiBase?: string;
  products: readonly VendorProduct[];
  lowStockThreshold: number;
  openAddRequested: boolean;
  onAddRequestHandled: () => void;
  onProductSaved: (product: VendorProduct, message: string) => void;
  onProductArchived: (productId: string, message: string) => void;
};

export function VendorProducts({
  apiBase = "/api/vendor",
  products,
  lowStockThreshold,
  openAddRequested,
  onAddRequestHandled,
  onProductSaved,
  onProductArchived,
}: ProductsProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editor, setEditor] = useState<VendorProduct | "new" | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))).sort(),
    [products],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "all" || product.category === category;
      const matchesQuery =
        !query ||
        [product.name, product.category, product.shortDescription, ...product.tags]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [category, products, search]);

  const toggleVisibility = async (product: VendorProduct) => {
    setUpdatingId(product.id);
    setError(null);
    try {
      const result = await vendorRequest<{ product: VendorProduct }>(
        `${apiBase}/products/${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: product.name,
            shortDescription: product.shortDescription,
            description: product.description,
            category: product.category,
            pricePaise: product.pricePaise,
            ...(product.compareAtPricePaise !== undefined
              ? { compareAtPricePaise: product.compareAtPricePaise }
              : {}),
            image: product.image,
            stock: product.stock,
            featured: product.featured,
            tags: product.tags,
            recipientTags: product.recipientTags,
            occasionTags: product.occasionTags,
            variants: product.variants ?? [],
            preparationTime: product.preparationTime,
            giftWrapEligible: product.giftWrapEligible,
            visible: !product.visible,
            version: product.version,
          }),
        },
      );
      onProductSaved(
        result.product,
        product.visible ? "Product hidden from the kiosk." : "Product published to the kiosk.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Visibility could not be updated.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="vendor-workspace vendor-products-view">
      <section className="vendor-products-toolbar" aria-label="Product filters">
        <label className="vendor-search-field">
          <Search size={19} />
          <span className="sr-only">Search products</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
          />
        </label>
        <label className="vendor-select-field">
          <SlidersHorizontal size={18} />
          <span className="sr-only">Filter by category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="vendor-primary" type="button" onClick={() => setEditor("new")}>
          <PackagePlus size={18} /> Add product
        </button>
      </section>

      {error ? (
        <div className="vendor-inline-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="vendor-panel vendor-product-panel" aria-labelledby="product-list-title">
        <header className="vendor-panel-header">
          <div>
            <h2 id="product-list-title">Catalogue</h2>
            <p>
              {products.filter((product) => product.visible).length} published · {products.length}{" "}
              active products
            </p>
          </div>
          <span className="vendor-result-count">Showing {filtered.length}</span>
        </header>
        {filtered.length ? (
          <div className="vendor-table-wrap">
            <table className="vendor-table vendor-product-table">
              <caption className="sr-only">Vendor product catalogue</caption>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Kiosk visibility</th>
                  <th>Updated</th>
                  <th>
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const low = product.stock <= lowStockThreshold;
                  return (
                    <tr key={product.id}>
                      <td data-label="Product">
                        <div className="vendor-product-cell">
                          <Image src={product.image} alt="" width={64} height={64} sizes="64px" />
                          <div>
                            <strong>{product.name}</strong>
                            <small>{product.id}</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Category">{product.category}</td>
                      <td data-label="Price">
                        <strong>{formatInr(product.pricePaise)}</strong>
                        {product.compareAtPricePaise ? (
                          <small className="vendor-compare-price">
                            {formatInr(product.compareAtPricePaise)}
                          </small>
                        ) : null}
                      </td>
                      <td data-label="Stock">
                        <span
                          className={`vendor-stock-state${product.stock === 0 ? " is-out" : low ? " is-low" : ""}`}
                        >
                          <i />
                          {product.stock === 0
                            ? "Sold out"
                            : low
                              ? `Low · ${product.stock}`
                              : `In stock · ${product.stock}`}
                        </span>
                      </td>
                      <td data-label="Kiosk visibility">
                        <label className="vendor-mini-toggle">
                          <input
                            type="checkbox"
                            checked={product.visible}
                            onChange={() => toggleVisibility(product)}
                            disabled={updatingId === product.id}
                            aria-label={`${product.visible ? "Hide" : "Show"} ${product.name} on kiosk`}
                          />
                          <i aria-hidden="true" />
                          <span>{product.visible ? "Visible" : "Hidden"}</span>
                        </label>
                      </td>
                      <td data-label="Updated">
                        <span>
                          {new Intl.DateTimeFormat("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }).format(new Date(product.updatedAt))}
                        </span>
                      </td>
                      <td>
                        <button
                          className="vendor-row-action"
                          type="button"
                          onClick={() => setEditor(product)}
                          aria-label={`Edit ${product.name}`}
                        >
                          <Edit3 size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="vendor-panel-empty">
            <div>
              <strong>No products match</strong>
              <p>Try a different search or category, or add a new product.</p>
            </div>
          </div>
        )}
      </section>

      {openAddRequested || editor ? (
        <VendorProductEditor
          apiBase={apiBase}
          key={openAddRequested || editor === "new" ? "new-product" : editor?.id}
          product={openAddRequested || editor === "new" ? null : editor}
          categories={categories}
          onClose={() => {
            setEditor(null);
            if (openAddRequested) onAddRequestHandled();
          }}
          onSaved={onProductSaved}
          onArchived={onProductArchived}
        />
      ) : null}
    </div>
  );
}
