"use client";

import Image from "next/image";
import { Check, ChevronRight, CircleHelp, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatInr } from "@/domain/money";
import type { CartLine, CartTotals, CategoryFilter, Product, ProductCategory } from "@/types/kiosk";

const MOMENT_FILTERS = [
  { value: "all", label: "All occasions" },
  { value: "Birthday", label: "Birthday" },
  { value: "Wedding", label: "Wedding" },
  { value: "Anniversary", label: "Anniversary" },
  { value: "For Home", label: "For Home" },
] as const;

type MomentFilter = (typeof MOMENT_FILTERS)[number]["value"];
type SortOption = "featured" | "price-ascending" | "price-descending";

function categoryLabel(category: CategoryFilter) {
  return category === "all" ? "All Products" : category;
}

type CatalogueScreenProps = {
  products: readonly Product[];
  categories: readonly ProductCategory[];
  selectedCategory: CategoryFilter;
  searchQuery: string;
  cart: readonly CartLine[];
  unitCount: number;
  maxUnits: number;
  totals: CartTotals;
  onCategoryChange: (category: CategoryFilter) => void;
  onOpenProduct: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onQuantityChange: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onOpenCart: () => void;
  onClearFilters: () => void;
  onNeedHelp: () => void;
};

export function CatalogueScreen({
  products,
  categories,
  selectedCategory,
  searchQuery,
  cart,
  unitCount,
  maxUnits,
  totals,
  onCategoryChange,
  onOpenProduct,
  onQuickAdd,
  onQuantityChange,
  onRemove,
  onOpenCart,
  onClearFilters,
  onNeedHelp,
}: CatalogueScreenProps) {
  const [selectedMoment, setSelectedMoment] = useState<MomentFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("featured");
  const capacityPercent = Math.min(100, (unitCount / maxUnits) * 100);
  const selectedQuantities = new Map<string, number>();

  for (const line of cart) {
    selectedQuantities.set(
      line.productId,
      (selectedQuantities.get(line.productId) ?? 0) + line.quantity,
    );
  }

  const momentProducts =
    selectedMoment === "all"
      ? products
      : products.filter((product) => product.occasionTags.includes(selectedMoment));
  const displayedProducts = [...momentProducts].sort((left, right) => {
    if (sortOption === "price-ascending") return left.pricePaise - right.pricePaise;
    if (sortOption === "price-descending") return right.pricePaise - left.pricePaise;
    return Number(right.featured) - Number(left.featured);
  });
  const hasActiveFilters =
    selectedCategory !== "all" ||
    searchQuery.trim().length > 0 ||
    selectedMoment !== "all" ||
    sortOption !== "featured";
  const clearFilters = () => {
    setSelectedMoment("all");
    setSortOption("featured");
    onClearFilters();
  };

  return (
    <div className="catalogue-layout">
      <main className="catalogue-main">
        <header className="catalogue-intro">
          <div className="catalogue-intro__copy">
            <h1 data-screen-heading tabIndex={-1}>
              Choose your gifts
            </h1>
            <p>Add up to {maxUnits} gifts, then review your cart.</p>
          </div>
        </header>

        <nav className="category-rail" aria-label="Gift categories">
          {(["all", ...categories] as const).map((category) => (
            <button
              key={category}
              className={`category-button ${selectedCategory === category ? "active" : ""}`}
              onClick={() => onCategoryChange(category)}
              aria-pressed={selectedCategory === category}
            >
              {categoryLabel(category)}
            </button>
          ))}
        </nav>

        <section className="moment-filter" aria-labelledby="moment-filter-heading">
          <div className="moment-filter__heading">
            <h2 id="moment-filter-heading">Shop by occasion</h2>
            <p>Show gifts for one occasion.</p>
          </div>
          <div className="moment-filter__options" role="group" aria-label="Filter by occasion">
            {MOMENT_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                className={`moment-filter__button ${selectedMoment === value ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedMoment(value)}
                aria-pressed={selectedMoment === value}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="catalogue-section" id="popular-gifts">
          <div className="section-heading-row">
            <div>
              <h2>
                {selectedCategory === "all" ? "Our products" : categoryLabel(selectedCategory)}
              </h2>
              <span
                className="catalogue-results"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {displayedProducts.length} {displayedProducts.length === 1 ? "gift" : "gifts"} found
              </span>
            </div>
            <div className="catalogue-toolbar">
              {hasActiveFilters ? (
                <button
                  className="text-button catalogue-clear"
                  type="button"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : null}
              <label className="catalogue-sort">
                <span>Sort by</span>
                <select
                  value={sortOption}
                  onChange={(event) => setSortOption(event.target.value as SortOption)}
                >
                  <option value="featured">Featured</option>
                  <option value="price-ascending">Price: Low to high</option>
                  <option value="price-descending">Price: High to low</option>
                </select>
              </label>
            </div>
          </div>

          {displayedProducts.length ? (
            <div className="product-grid">
              {displayedProducts.map((product, index) => {
                const availabilityLabel =
                  product.availability === "unavailable"
                    ? "Unavailable"
                    : product.availability === "low_stock"
                      ? "Limited stock"
                      : "Available to order";
                const selectedQuantity = selectedQuantities.get(product.id) ?? 0;
                return (
                  <article
                    className={`product-card product-module ${selectedQuantity > 0 ? "selected" : ""}`}
                    key={product.id}
                  >
                    <div className="product-card__image-wrap">
                      <button
                        className="product-card__image-button"
                        type="button"
                        onClick={() => onOpenProduct(product)}
                        aria-label={`View details for ${product.name}`}
                      >
                        <Image
                          src={product.image}
                          alt={product.name}
                          width={720}
                          height={720}
                          sizes="(max-width: 560px) calc(100vw - 32px), (max-width: 900px) 50vw, (max-width: 1120px) 33vw, 25vw"
                          loading={index < 4 ? "eager" : "lazy"}
                        />
                      </button>
                      {selectedQuantity > 0 ? (
                        <span className="product-card__selected-badge">
                          <Check size={15} aria-hidden="true" /> {selectedQuantity} selected
                        </span>
                      ) : null}
                    </div>
                    <div className="product-card__body">
                      <h3>
                        <button
                          className="product-card__title-button"
                          type="button"
                          onClick={() => onOpenProduct(product)}
                        >
                          <span className="product-card__title-text">{product.name}</span>
                        </button>
                      </h3>
                      <span className="product-card__category">{product.category}</span>
                      <p className="product-card__descriptor">{product.shortDescription}</p>
                      <div className="product-card__purchase-row">
                        <div className="product-card__price">
                          <span>{formatInr(product.pricePaise)}</span>
                          {product.compareAtPricePaise &&
                          product.compareAtPricePaise > product.pricePaise ? (
                            <del>{formatInr(product.compareAtPricePaise)}</del>
                          ) : null}
                        </div>
                        <span
                          className={`availability ${product.availability === "low_stock" ? "low" : product.availability === "unavailable" ? "unavailable" : ""}`}
                        >
                          <span aria-hidden="true">●</span>
                          {availabilityLabel}
                        </span>
                      </div>
                      <div className="product-card__actions">
                        <button
                          className="detail-button"
                          onClick={() => onOpenProduct(product)}
                          aria-label={`View details for ${product.name}`}
                        >
                          View details
                        </button>
                        <button
                          className={`quick-button ${selectedQuantity > 0 ? "selected" : ""}`}
                          onClick={() => onQuickAdd(product)}
                          disabled={product.availability === "unavailable"}
                          aria-label={
                            selectedQuantity > 0
                              ? `Add another ${product.name}. ${selectedQuantity} currently selected`
                              : `Quick add ${product.name}`
                          }
                        >
                          {selectedQuantity > 0 ? (
                            <>
                              <Check size={16} /> Added · {selectedQuantity}
                            </>
                          ) : (
                            "Quick add"
                          )}
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <div>
                <h2>No gifts match that search</h2>
                <p>Try another product name, category, or occasion.</p>
                <button className="secondary-button" onClick={clearFilters}>
                  Clear search and filters
                </button>
              </div>
            </div>
          )}

          <section className="how-it-works" aria-labelledby="how-it-works-title">
            <div>
              <h2 id="how-it-works-title">How it works</h2>
              <p>
                Choose your gifts, review a Pay Later order, then scan one QR to open the exact
                prepared message in WhatsApp.
              </p>
            </div>
            <ol>
              <li>
                <span>1</span>Choose gifts
              </li>
              <li>
                <span>2</span>Review details
              </li>
              <li>
                <span>3</span>Scan and tap Send
              </li>
            </ol>
            <button className="secondary-button" onClick={onNeedHelp}>
              <CircleHelp size={18} /> Need Help?
            </button>
          </section>
        </section>
      </main>

      {cart.length ? (
        <>
          <div className="catalogue-reassurance" aria-label="Ordering reassurance">
            <span>Pay at the counter</span>
            <span>You send the order on WhatsApp</span>
            <span className="catalogue-reassurance__detail">
              Nothing is sent until you tap Send
            </span>
          </div>
          <aside className="cart-rail" aria-label="Cart summary">
            <div className="cart-rail__inner">
              <div className="cart-rail__identity">
                <div>
                  <h2>Your cart</h2>
                  <span className="cart-rail__count">
                    {unitCount} of {maxUnits} gifts selected
                  </span>
                </div>
              </div>

              <div className="cart-rail__items" aria-label="Selected gifts" role="list">
                {cart.map((line) => (
                  <div className="mini-cart-line" key={line.key} role="listitem">
                    <span className="sr-only">
                      {line.productName}, quantity {line.quantity}
                    </span>
                    <div className="mini-cart-line__image">
                      <Image src={line.productImage} alt="" width={140} height={156} sizes="70px" />
                    </div>
                    <div className="mini-cart-line__tools">
                      <h3>{line.productName}</h3>
                      <div
                        className="quantity-control"
                        aria-label={`Quantity for ${line.productName}`}
                      >
                        <button
                          onClick={() => onQuantityChange(line.key, line.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} />
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          onClick={() => onQuantityChange(line.key, line.quantity + 1)}
                          disabled={unitCount >= maxUnits}
                          aria-label="Increase quantity"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <button
                      className="remove-icon"
                      onClick={() => onRemove(line.key)}
                      aria-label={`Remove ${line.productName}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="capacity-meter">
                <div className="capacity-meter__label">
                  <span>
                    {unitCount} / {maxUnits} items
                  </span>
                </div>
                <div
                  className="capacity-meter__track"
                  role="progressbar"
                  aria-label="Cart capacity"
                  aria-valuemin={0}
                  aria-valuemax={maxUnits}
                  aria-valuenow={unitCount}
                >
                  <div className="capacity-meter__fill" style={{ width: `${capacityPercent}%` }} />
                </div>
              </div>

              <div className="cart-rail__footer">
                <div className="cart-rail__total">
                  <span>Total</span>
                  <strong>{formatInr(totals.totalPaise)}</strong>
                </div>
                <span className="sr-only">
                  Subtotal {formatInr(totals.subtotalPaise)}. Gift wrapping{" "}
                  {formatInr(totals.giftWrapPaise)}.
                </span>
                <button className="primary-button" onClick={onOpenCart} aria-label="Review cart">
                  Review cart <ChevronRight size={19} />
                </button>
              </div>
            </div>
          </aside>
        </>
      ) : null}

      {cart.length ? (
        <button
          className="mobile-cart-button"
          onClick={onOpenCart}
          aria-label={`Cart · ${unitCount} / ${maxUnits} · ${formatInr(totals.totalPaise)} · ${cart.map((line) => `${line.productName}, quantity ${line.quantity}`).join("; ")}`}
        >
          <span className="mobile-cart-button__copy">
            <strong>Your cart</strong>
            <small>
              {unitCount} / {maxUnits} gifts · {formatInr(totals.totalPaise)}
            </small>
          </span>
          <span className="mobile-cart-button__action">
            Review <ChevronRight size={17} />
          </span>
        </button>
      ) : null}
    </div>
  );
}
