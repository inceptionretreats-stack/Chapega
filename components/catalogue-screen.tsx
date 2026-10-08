"use client";

import Image from "next/image";
import {
  Boxes,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Eye,
  Flower2,
  Frame,
  Gift,
  Grid2X2,
  Heart,
  Images,
  MessageCircle,
  Minus,
  PackageOpen,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { formatInr } from "@/domain/money";
import type { CartLine, CartTotals, CategoryFilter, Product, ProductCategory } from "@/types/kiosk";

const MOMENT_FILTERS = [
  { value: "all", label: "All moments", Icon: Grid2X2 },
  { value: "Birthday", label: "Birthday", Icon: Gift },
  { value: "Wedding", label: "Wedding", Icon: Heart },
  { value: "Anniversary", label: "Anniversary", Icon: Flower2 },
  { value: "For Home", label: "For Home", Icon: Frame },
] as const;

type MomentFilter = (typeof MOMENT_FILTERS)[number]["value"];
type SortOption = "featured" | "price-ascending" | "price-descending";

function categoryPresentation(category: CategoryFilter) {
  if (category === "all") {
    return { Icon: Grid2X2, label: "All Products" };
  }

  const normalized = category.toLowerCase();
  if (normalized.includes("hamper")) return { Icon: Boxes, label: category };
  if (normalized.includes("varmala") || normalized.includes("wedding"))
    return { Icon: Heart, label: category };
  if (normalized.includes("resin") || normalized.includes("flower"))
    return { Icon: Flower2, label: category };
  if (normalized.includes("frame")) return { Icon: Frame, label: category };
  if (normalized.includes("personal")) return { Icon: Images, label: category };
  return { Icon: Gift, label: category };
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
              Find a gift worth keeping
            </h1>
            <p>Thoughtful creations for the people who make life special.</p>
          </div>
        </header>

        <nav className="category-rail" aria-label="Gift categories">
          {(["all", ...categories] as const).map((category) => {
            const { Icon, label } = categoryPresentation(category);
            return (
              <button
                key={category}
                className={`category-button ${selectedCategory === category ? "active" : ""}`}
                onClick={() => onCategoryChange(category)}
                aria-pressed={selectedCategory === category}
              >
                <Icon size={17} strokeWidth={1.8} />
                {label}
              </button>
            );
          })}
        </nav>

        <section className="moment-filter" aria-labelledby="moment-filter-heading">
          <div className="moment-filter__heading">
            <h2 id="moment-filter-heading">Shop by moment</h2>
            <p>Choose the feeling first—we’ll help narrow the gifts.</p>
          </div>
          <div className="moment-filter__options" role="group" aria-label="Filter by moment">
            {MOMENT_FILTERS.map(({ value, label, Icon }) => (
              <button
                key={value}
                className={`moment-filter__button ${selectedMoment === value ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedMoment(value)}
                aria-pressed={selectedMoment === value}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="catalogue-section" id="popular-gifts">
          <div className="section-heading-row">
            <div>
              <h2>
                {selectedCategory === "all"
                  ? "Our products"
                  : categoryPresentation(selectedCategory).label}
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
                        <span className="product-card__view-overlay" aria-hidden="true">
                          <Eye size={17} /> View gift
                        </span>
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
                          {product.name}
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
                          <Eye size={16} /> View details
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
              <PackageOpen size={42} />
              <div>
                <h2>No gifts match that search</h2>
                <p>Try another product name, category, or moment.</p>
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
            <span>
              <Gift size={17} aria-hidden="true" /> Personalised with care
            </span>
            <span>
              <CreditCard size={17} aria-hidden="true" /> No online payment
            </span>
            <span>
              <MessageCircle size={17} aria-hidden="true" /> Send on WhatsApp
            </span>
            <span className="catalogue-reassurance__detail">
              <ShieldCheck size={17} aria-hidden="true" /> Nothing is sent until you tap Send
            </span>
          </div>
          <aside className="cart-rail" aria-label="Cart summary">
            <div className="cart-rail__inner">
              <div className="cart-rail__identity">
                <ShoppingBag size={30} aria-hidden="true" />
                <div>
                  <h2>Your Selection</h2>
                  <p className="cart-rail__lead-item">Add your favourite gifts</p>
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
                {unitCount < maxUnits ? (
                  <div className="cart-rail__add-slot" aria-hidden="true">
                    <Plus size={24} />
                  </div>
                ) : null}
              </div>

              <div className="capacity-meter">
                <div className="capacity-meter__label">
                  <span>
                    {unitCount} / {maxUnits} items
                  </span>
                  <span>Capacity&nbsp; {maxUnits}</span>
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
                  Review Selection <ChevronRight size={19} />
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
          <span className="mobile-cart-button__icon">
            <ShoppingBag size={20} />
          </span>
          <span className="mobile-cart-button__copy">
            <strong>Your Selection</strong>
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
