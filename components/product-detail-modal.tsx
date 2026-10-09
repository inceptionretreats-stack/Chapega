"use client";

import Image from "next/image";
import { Check, Gift, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useRef, useState } from "react";
import { formatInr } from "@/domain/money";
import type { Product } from "@/types/kiosk";
import { useModalFocus } from "./use-modal-focus";

type ProductDetailModalProps = {
  product: Product;
  remainingCapacity: number;
  giftWrapFeePaise: number;
  onClose: () => void;
  onAdd: (input: {
    productId: string;
    variantId?: string;
    quantity: number;
    giftWrapped: boolean;
  }) => void;
};

export function ProductDetailModal({
  product,
  remainingCapacity,
  giftWrapFeePaise,
  onClose,
  onAdd,
}: ProductDetailModalProps) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [giftWrapped, setGiftWrapped] = useState(false);
  const selectedVariant = product.variants.find((variant) => variant.id === variantId);
  const price = product.pricePaise + (selectedVariant?.priceAdjustmentPaise ?? 0);
  const totalPrice = (price + (giftWrapped ? giftWrapFeePaise : 0)) * quantity;
  const unavailable = product.availability === "unavailable" || product.stock < 1;
  const maxQuantity = Math.max(1, Math.min(product.stock, remainingCapacity));
  const detailTags = Array.from(new Set([...product.occasionTags, ...product.recipientTags])).slice(
    0,
    4,
  );
  const dialogRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useModalFocus(dialogRef, initialFocusRef, onClose);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className="modal-panel wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        tabIndex={-1}
      >
        <button
          ref={initialFocusRef}
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Close product details"
        >
          <X size={21} />
        </button>
        <div className="product-detail-layout">
          <div className="product-detail-media">
            <Image
              src={product.image}
              alt={product.name}
              width={720}
              height={720}
              sizes="(max-width: 900px) 100vw, 500px"
            />
          </div>
          <div className="product-detail-copy">
            <span className="product-card__category">{product.category}</span>
            <h2 id="product-detail-title">{product.name}</h2>
            <p>{product.description}</p>
            <div className="product-detail-price">
              <span>{formatInr(price)}</span>
              {product.compareAtPricePaise && product.compareAtPricePaise > product.pricePaise ? (
                <del>{formatInr(product.compareAtPricePaise)}</del>
              ) : null}
            </div>

            {detailTags.length ? (
              <div className="product-detail-tags" aria-label="Suitable occasions">
                {detailTags.map((tag) => (
                  <span key={tag}>
                    {tag.replace(/(^|-)\w/g, (letter) => letter.replace("-", " ").toUpperCase())}
                  </span>
                ))}
              </div>
            ) : null}

            {product.variants.length ? (
              <div className="field">
                <span>Choose a style</span>
                <div className="choice-row">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      className={`choice-button ${variantId === variant.id ? "active" : ""}`}
                      onClick={() => setVariantId(variant.id)}
                      aria-pressed={variantId === variant.id}
                    >
                      {variant.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="detail-meta">
              <div>
                <strong>Preparation</strong>
                {product.preparationTime}
              </div>
              <div>
                <strong>Availability</strong>
                {unavailable ? "Currently unavailable" : "Available to order"}
              </div>
            </div>

            <div className="field">
              <span>Quantity</span>
              <div className="quantity-control" style={{ width: 142 }}>
                <button
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus size={15} />
                </button>
                <span>{quantity}</span>
                <button
                  onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))}
                  disabled={quantity >= maxQuantity || remainingCapacity === 0}
                  aria-label="Increase quantity"
                >
                  <Plus size={15} />
                </button>
              </div>
              <small>
                {remainingCapacity > 0
                  ? `You can add ${remainingCapacity} more gift${remainingCapacity === 1 ? "" : "s"}.`
                  : "Your cart already contains the maximum number of gifts."}
              </small>
            </div>

            {product.giftWrapEligible ? (
              <button
                className={`wrap-toggle ${giftWrapped ? "active" : ""}`}
                onClick={() => setGiftWrapped((current) => !current)}
                aria-pressed={giftWrapped}
              >
                <Gift size={17} />{" "}
                {giftWrapped ? (
                  <>
                    <Check size={15} /> Gift wrap selected · {formatInr(giftWrapFeePaise)} each
                  </>
                ) : (
                  `Add gift wrap · ${formatInr(giftWrapFeePaise)} each`
                )}
              </button>
            ) : null}

            <div className="product-detail-total" aria-live="polite">
              <span>
                <small>Current total</small>
                <strong>{formatInr(totalPrice)}</strong>
              </span>
              <small>
                {quantity} {quantity === 1 ? "gift" : "gifts"}
                {giftWrapped ? " with gift wrap" : ""}
              </small>
            </div>

            <div className="product-detail-guidance">
              <span>
                Names, photos, and final personalisation details are confirmed with the shop on
                WhatsApp.
              </span>
            </div>

            <button
              className="primary-button"
              style={{ width: "100%", marginTop: 22 }}
              disabled={remainingCapacity === 0 || unavailable}
              onClick={() =>
                onAdd({
                  productId: product.id,
                  variantId: variantId || undefined,
                  quantity,
                  giftWrapped,
                })
              }
            >
              <ShoppingBag size={19} />{" "}
              {unavailable
                ? "Currently unavailable"
                : `Add ${quantity} to cart · ${formatInr(totalPrice)}`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
