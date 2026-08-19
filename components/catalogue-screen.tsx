"use client";

import Image from "next/image";
import {
  Boxes,
  ChevronRight,
  CircleHelp,
  Eye,
  Flower2,
  Frame,
  Gift,
  Grid2X2,
  Heart,
  Images,
  Minus,
  PackageOpen,
  Plus,
  ShoppingBag,
  Sparkles,
  Trash2,
} from "lucide-react";
import { formatInr } from "@/domain/money";
import type {
  CartLine,
  CartTotals,
  CategoryFilter,
  Product,
  ProductCategory,
} from "@/types/kiosk";

function categoryPresentation(category: CategoryFilter) {
  if (category === "all") {
    return { Icon: Grid2X2, label: "All Products" };
  }

  const normalized = category.toLowerCase();
  if (normalized.includes("hamper")) return { Icon: Boxes, label: category };
  if (normalized.includes("varmala") || normalized.includes("wedding")) return { Icon: Heart, label: category };
  if (normalized.includes("resin") || normalized.includes("flower")) return { Icon: Flower2, label: category };
  if (normalized.includes("frame")) return { Icon: Frame, label: category };
  if (normalized.includes("personal")) return { Icon: Images, label: category };
  return { Icon: Gift, label: category };
}

type CatalogueScreenProps = {
  products: readonly Product[];
  categories: readonly ProductCategory[];
  selectedCategory: CategoryFilter;
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
  const capacityPercent = Math.min(100, (unitCount / maxUnits) * 100);

  return (
    <div className="catalogue-layout">
      <main className="catalogue-main">
        <section className="catalogue-hero">
          <Image
            className="catalogue-hero__media"
            src="/products/full-varmala-preservation-25x26.jpeg"
            alt="A personalized wedding garland preservation frame"
            width={720}
            height={983}
            priority
          />
          <div className="catalogue-hero__copy">
            <h1>Find something they’ll remember.</h1>
            <p>Personalized frames, hampers, resin art, and wedding keepsakes.</p>
            <button
              className="primary-button"
              onClick={() => document.getElementById("popular-gifts")?.scrollIntoView({ behavior: "smooth" })}
            >
              Explore gifts <ChevronRight size={19} />
            </button>
          </div>
        </section>

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

        <section className="catalogue-section" id="popular-gifts">
          <div className="section-heading-row">
            <div>
              <h2>{selectedCategory === "all" ? "Our products" : categoryPresentation(selectedCategory).label}</h2>
              <p>{products.length} {products.length === 1 ? "product" : "products"} from the supplied catalogue.</p>
            </div>
            <span className="capacity-inline">Maximum {maxUnits} gifts per order</span>
          </div>

          {products.length ? (
            <div className="product-grid">
              {products.map((product) => {
                const availabilityLabel = product.availability === "unavailable"
                  ? "Unavailable"
                  : product.availability === "low_stock"
                    ? "Limited stock"
                    : "Available to order";
                return (
                <article className="product-card" key={product.id}>
                  <div className="product-card__image-wrap">
                    <Image src={product.image} alt={product.name} width={720} height={720} />
                    <span className={`availability ${product.availability === "low_stock" ? "low" : product.availability === "unavailable" ? "unavailable" : ""}`}>
                      <span aria-hidden="true">●</span>
                      {availabilityLabel}
                    </span>
                  </div>
                  <div className="product-card__body">
                    <span className="product-card__category">{product.category}</span>
                    <h3>{product.name}</h3>
                    <p className="product-card__descriptor">{product.shortDescription}</p>
                    <div className="product-card__price">
                      <span>{formatInr(product.pricePaise)}</span>
                      {product.compareAtPricePaise && product.compareAtPricePaise > product.pricePaise ? (
                        <del>{formatInr(product.compareAtPricePaise)}</del>
                      ) : null}
                    </div>
                    <div className="product-card__actions">
                      <button className="detail-button" onClick={() => onOpenProduct(product)}>
                        <Eye size={16} /> View details
                      </button>
                      <button
                        className="quick-button"
                        onClick={() => onQuickAdd(product)}
                        disabled={product.availability === "unavailable"}
                      >
                        <ShoppingBag size={16} /> Quick add
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
                <p>Try another product name or category.</p>
                <button className="secondary-button" onClick={onClearFilters}>Clear search and filters</button>
              </div>
            </div>
          )}

          <section className="how-it-works" aria-labelledby="how-it-works-title">
            <div>
              <span className="product-card__category">Simple kiosk handoff</span>
              <h2 id="how-it-works-title">How it works</h2>
              <p>Choose up to five gifts, review a Pay Later order, then scan one QR to open the exact prepared message in WhatsApp.</p>
            </div>
            <ol>
              <li><span>1</span>Choose gifts</li>
              <li><span>2</span>Review details</li>
              <li><span>3</span>Scan and tap Send</li>
            </ol>
            <button className="secondary-button" onClick={onNeedHelp}><CircleHelp size={18} /> Need Help?</button>
          </section>
        </section>
      </main>

      <aside className="cart-rail" aria-label="Cart summary">
        <div className="cart-rail__inner">
          <div className="cart-rail__title">
            <h2><ShoppingBag size={21} /> Your cart</h2>
            {unitCount ? <Sparkles size={18} /> : null}
          </div>
          <div className="capacity-meter">
            <div className="capacity-meter__label">
              <span>{unitCount} of {maxUnits} gifts selected</span>
              <span>{Math.round(capacityPercent)}%</span>
            </div>
            <div className="capacity-meter__track" aria-hidden="true">
              <div className="capacity-meter__fill" style={{ width: `${capacityPercent}%` }} />
            </div>
          </div>

          <div className="cart-rail__items">
            {cart.length ? cart.map((line) => (
              <div className="mini-cart-line" key={line.key}>
                <Image src={line.productImage} alt="" width={140} height={156} />
                <div>
                  <h3>{line.productName}</h3>
                  {line.variantName ? <div className="product-card__descriptor">{line.variantName}</div> : null}
                  <strong>{formatInr(line.unitPricePaise)}</strong>
                  <div className="quantity-control" aria-label={`Quantity for ${line.productName}`}>
                    <button onClick={() => onQuantityChange(line.key, line.quantity - 1)} aria-label="Decrease quantity"><Minus size={14} /></button>
                    <span>{line.quantity}</span>
                    <button onClick={() => onQuantityChange(line.key, line.quantity + 1)} disabled={unitCount >= maxUnits} aria-label="Increase quantity"><Plus size={14} /></button>
                  </div>
                </div>
                <button className="remove-icon" onClick={() => onRemove(line.key)} aria-label={`Remove ${line.productName}`}><Trash2 size={17} /></button>
              </div>
            )) : (
              <div className="empty-mini-cart">
                <div>
                  <ShoppingBag size={30} />
                  <strong>Your cart is ready</strong>
                  <div>Add a gift to begin.</div>
                </div>
              </div>
            )}
          </div>

          <div className="cart-rail__footer">
            <div className="totals-row"><span>Subtotal ({unitCount} items)</span><strong>{formatInr(totals.subtotalPaise)}</strong></div>
            <div className="totals-row"><span>Gift wrapping</span><strong>{formatInr(totals.giftWrapPaise)}</strong></div>
            <div className="totals-row total"><span>Total</span><strong>{formatInr(totals.totalPaise)}</strong></div>
            <p className="product-card__descriptor">You can add {Math.max(0, maxUnits - unitCount)} more gifts.</p>
            <button className="primary-button" onClick={onOpenCart} disabled={!cart.length}>
              <ShoppingBag size={19} /> Review cart
            </button>
          </div>
        </div>
      </aside>

      <button className="mobile-cart-button" onClick={onOpenCart} disabled={!cart.length}>
        <ShoppingBag size={20} /> Cart · {unitCount} / {maxUnits} · {formatInr(totals.totalPaise)}
      </button>
    </div>
  );
}
