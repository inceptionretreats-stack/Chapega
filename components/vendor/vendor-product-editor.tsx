"use client";

import {
  Archive,
  ImagePlus,
  Layers3,
  LoaderCircle,
  PackageCheck,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { formatInr } from "@/domain/money";
import type { ProductVariant } from "@/types/kiosk";
import type { VendorProduct, VendorProductInput } from "@/types/vendor";
import { ConfirmDialog } from "../confirm-dialog";
import { useModalFocus } from "../use-modal-focus";
import {
  commaSeparated,
  parseCommaSeparated,
  vendorRequest,
  VendorClientError,
} from "./vendor-client";
import { focusFirstInvalid } from "./vendor-shared";

type EditorProps = {
  apiBase?: string;
  product: VendorProduct | null;
  categories: readonly string[];
  onClose: () => void;
  onSaved: (product: VendorProduct, message: string) => void;
  onArchived: (productId: string, message: string) => void;
};

type ProductDraft = {
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  preparationTime: string;
  tags: string;
  recipientTags: string;
  occasionTags: string;
  variants: VariantDraft[];
  visible: boolean;
  featured: boolean;
  giftWrapEligible: boolean;
};

type VariantDraft = {
  clientKey: string;
  id: string;
  name: string;
  priceAdjustment: string;
  stock: string;
};

type VariantDraftErrors = {
  name?: string;
  priceAdjustment?: string;
  stock?: string;
  row?: string;
};

type ProductFieldKey =
  | "name"
  | "shortDescription"
  | "description"
  | "category"
  | "price"
  | "compareAtPrice"
  | "stock"
  | "preparationTime"
  | "tags"
  | "occasionTags"
  | "recipientTags"
  | "image";

type ProductFieldErrors = Partial<Record<ProductFieldKey, string>>;

/** Server field names that differ from the draft's field keys. */
const SERVER_FIELD_KEYS: Readonly<Record<string, ProductFieldKey>> = {
  pricePaise: "price",
  compareAtPricePaise: "compareAtPrice",
};

const PRODUCT_FIELD_KEYS: readonly ProductFieldKey[] = [
  "name",
  "shortDescription",
  "description",
  "category",
  "price",
  "compareAtPrice",
  "stock",
  "preparationTime",
  "tags",
  "occasionTags",
  "recipientTags",
  "image",
];

function fieldErrorsFromServer(
  fields: Record<string, string[] | undefined> | undefined,
): ProductFieldErrors {
  const mapped: ProductFieldErrors = {};
  for (const [name, messages] of Object.entries(fields ?? {})) {
    const key = SERVER_FIELD_KEYS[name] ?? (name as ProductFieldKey);
    if (PRODUCT_FIELD_KEYS.includes(key) && messages?.[0]) mapped[key] = messages[0];
  }
  return mapped;
}

const MAX_VARIANTS = 20;
const MAX_PRICE_PAISE = 100_000_000;
const MAX_STOCK = 100_000;
const VENDOR_UPLOAD_PATTERN = /^\/vendor-products\/(?:[a-f0-9-]{36}\/)?[a-f0-9]{64}\.(?:png|jpg)$/;

async function releaseUnusedUpload(
  image: VendorProduct["image"] | undefined,
  apiBase: string,
): Promise<void> {
  if (!image || !VENDOR_UPLOAD_PATTERN.test(image)) return;
  try {
    await vendorRequest(`${apiBase}/uploads`, {
      method: "DELETE",
      body: JSON.stringify({ path: image }),
    });
  } catch {
    // Cleanup is best-effort. Server reference checks guarantee that an image
    // attached to a product or historical order is never removed.
  }
}

function variantDraftFromProduct(variant: ProductVariant, index: number): VariantDraft {
  return {
    clientKey: `${variant.id}-${index}`,
    id: variant.id,
    name: variant.name,
    priceAdjustment: String(variant.priceAdjustmentPaise / 100),
    stock: variant.stock === undefined ? "" : String(variant.stock),
  };
}

function createVariantDraft(): VariantDraft {
  const id = crypto.randomUUID();
  return {
    clientKey: id,
    id,
    name: "",
    priceAdjustment: "0",
    stock: "",
  };
}

function draftFromProduct(product: VendorProduct | null): ProductDraft {
  return {
    name: product?.name ?? "",
    shortDescription: product?.shortDescription ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "Personalized Gifts",
    price: product ? String(product.pricePaise / 100) : "",
    compareAtPrice: product?.compareAtPricePaise ? String(product.compareAtPricePaise / 100) : "",
    stock: product ? String(product.stock) : "1",
    preparationTime: product?.preparationTime ?? "Confirm timing on WhatsApp",
    tags: product ? commaSeparated(product.tags) : "",
    recipientTags: product ? commaSeparated(product.recipientTags) : "",
    occasionTags: product ? commaSeparated(product.occasionTags) : "",
    variants: (product?.variants ?? []).map(variantDraftFromProduct),
    visible: product?.visible ?? true,
    featured: product?.featured ?? false,
    giftWrapEligible: product?.giftWrapEligible ?? true,
  };
}

function paise(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  const result = Math.round(number * 100);
  return Number.isFinite(number) &&
    Number.isSafeInteger(result) &&
    result >= 0 &&
    result <= MAX_PRICE_PAISE
    ? result
    : null;
}

function signedPaise(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  const result = Math.round(number * 100);
  return Number.isFinite(number) &&
    Number.isSafeInteger(result) &&
    Math.abs(result) <= MAX_PRICE_PAISE
    ? result
    : null;
}

function variantFinalPrice(basePrice: string, adjustment: string): string | null {
  const basePricePaise = paise(basePrice);
  const adjustmentPaise = signedPaise(adjustment);
  if (basePricePaise === null || adjustmentPaise === null) return null;
  const total = basePricePaise + adjustmentPaise;
  return total >= 0 ? formatInr(total) : null;
}

function clearVariantErrorField(
  current: Record<string, VariantDraftErrors>,
  field: "name" | "priceAdjustment" | "stock",
  clientKey?: string,
): Record<string, VariantDraftErrors> {
  let changed = false;
  const next: Record<string, VariantDraftErrors> = {};

  for (const [key, row] of Object.entries(current)) {
    if (clientKey !== undefined && key !== clientKey) {
      next[key] = row;
      continue;
    }
    if (row[field] === undefined) {
      next[key] = row;
      continue;
    }
    const nextRow = { ...row };
    delete nextRow[field];
    changed = true;
    if (Object.keys(nextRow).length > 0) next[key] = nextRow;
  }

  return changed ? next : current;
}

function validateVariants(
  drafts: readonly VariantDraft[],
  basePricePaise: number,
): {
  errors: Record<string, VariantDraftErrors>;
  variants: ProductVariant[] | null;
} {
  const errors: Record<string, VariantDraftErrors> = {};
  const variants: ProductVariant[] = [];
  const normalizedNameCounts = new Map<string, number>();
  const normalizedIdCounts = new Map<string, number>();

  for (const draft of drafts) {
    const normalizedName = draft.name.trim().toLocaleLowerCase("en-IN");
    const normalizedId = draft.id.trim().toLocaleLowerCase("en-IN");
    if (normalizedName) {
      normalizedNameCounts.set(normalizedName, (normalizedNameCounts.get(normalizedName) ?? 0) + 1);
    }
    if (normalizedId) {
      normalizedIdCounts.set(normalizedId, (normalizedIdCounts.get(normalizedId) ?? 0) + 1);
    }
  }

  for (const draft of drafts) {
    const rowErrors: VariantDraftErrors = {};
    const id = draft.id.trim();
    const name = draft.name.trim();
    const normalizedName = name.toLocaleLowerCase("en-IN");
    const normalizedId = id.toLocaleLowerCase("en-IN");
    const priceAdjustmentPaise = signedPaise(draft.priceAdjustment);
    const stock = draft.stock.trim() ? Number(draft.stock) : undefined;

    if (!name) {
      rowErrors.name = "Enter a name customers can recognise.";
    } else if ((normalizedNameCounts.get(normalizedName) ?? 0) > 1) {
      rowErrors.name = "Use a unique name for every option.";
    }

    if (!id || (normalizedIdCounts.get(normalizedId) ?? 0) > 1) {
      rowErrors.row = "This option has an identity conflict. Remove it and add it again.";
    }

    if (priceAdjustmentPaise === null) {
      rowErrors.priceAdjustment =
        "Enter an amount between −₹10,00,000 and ₹10,00,000; use 0 for no change.";
    } else if (basePricePaise + priceAdjustmentPaise < 0) {
      rowErrors.priceAdjustment = "The final option price cannot be less than ₹0.";
    }

    if (stock !== undefined && (!Number.isSafeInteger(stock) || stock < 0 || stock > MAX_STOCK)) {
      rowErrors.stock = "Use a whole number from 0 to 100,000, or leave this blank.";
    }

    if (Object.keys(rowErrors).length > 0) {
      errors[draft.clientKey] = rowErrors;
      continue;
    }

    variants.push({
      id,
      name,
      priceAdjustmentPaise: priceAdjustmentPaise as number,
      ...(stock === undefined ? {} : { stock }),
    });
  }

  return {
    errors,
    variants: Object.keys(errors).length === 0 ? variants : null,
  };
}

export function VendorProductEditor({
  apiBase = "/api/vendor",
  product,
  categories,
  onClose,
  onSaved,
  onArchived,
}: EditorProps) {
  const [draft, setDraft] = useState<ProductDraft>(() => draftFromProduct(product));
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantErrors, setVariantErrors] = useState<Record<string, VariantDraftErrors>>({});
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [failureCount, setFailureCount] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : product?.image),
    [file, product?.image],
  );

  // While the archive confirmation is open it sits on top of the modal stack
  // and handles Escape itself.
  useModalFocus(drawerRef, closeButtonRef, () => {
    if (pending || archiving || confirmArchive) return;
    onClose();
  });

  // After a failed save/archive the clicked button was disabled and focus fell
  // to <body>: focus the first invalid field, or the alert summary.
  useEffect(() => {
    if (failureCount === 0) return;
    focusFirstInvalid(formRef.current, errorRef.current);
  }, [failureCount]);

  const fieldAria = (key: ProductFieldKey) =>
    fieldErrors[key]
      ? { "aria-invalid": true as const, "aria-describedby": `vendor-product-${key}-error` }
      : {};
  const fieldError = (key: ProductFieldKey) =>
    fieldErrors[key] ? (
      <small className="vendor-field-error" id={`vendor-product-${key}-error`}>
        {fieldErrors[key]}
      </small>
    ) : null;

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const update = <Key extends keyof ProductDraft>(key: Key, value: ProductDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => (key in current ? { ...current, [key]: undefined } : current));
    if (key === "price") {
      setVariantErrors((current) => clearVariantErrorField(current, "priceAdjustment"));
    }
  };

  const addVariant = () => {
    setDraft((current) => {
      if (current.variants.length >= MAX_VARIANTS) return current;
      return {
        ...current,
        variants: [...current.variants, createVariantDraft()],
      };
    });
    setError(null);
  };

  const updateVariant = <
    Key extends keyof Pick<VariantDraft, "name" | "priceAdjustment" | "stock">,
  >(
    clientKey: string,
    key: Key,
    value: VariantDraft[Key],
  ) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        variant.clientKey === clientKey ? { ...variant, [key]: value } : variant,
      ),
    }));
    setVariantErrors((current) =>
      clearVariantErrorField(current, key, key === "name" ? undefined : clientKey),
    );
    setError(null);
  };

  const removeVariant = (clientKey: string) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.filter((variant) => variant.clientKey !== clientKey),
    }));
    setVariantErrors((current) => {
      if (!(clientKey in current)) return current;
      const next = { ...current };
      delete next[clientKey];
      return next;
    });
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setVariantErrors({});
    setFieldErrors({});
    const fail = (message: string, fields: ProductFieldErrors = {}) => {
      setFieldErrors(fields);
      setError(message);
      setFailureCount((count) => count + 1);
    };
    const pricePaise = paise(draft.price);
    const compareAtPricePaise = paise(draft.compareAtPrice);
    const stock = Number(draft.stock);
    const stockInvalid = !Number.isSafeInteger(stock) || stock < 0 || stock > MAX_STOCK;
    if (pricePaise === null || stockInvalid) {
      fail("Enter a valid price and a stock quantity from 0 to 100,000.", {
        ...(pricePaise === null ? { price: "Enter a price from ₹0 to ₹10,00,000." } : {}),
        ...(stockInvalid ? { stock: "Use a whole number from 0 to 100,000." } : {}),
      });
      return;
    }
    if (
      draft.compareAtPrice.trim() &&
      (compareAtPricePaise === null || compareAtPricePaise <= pricePaise)
    ) {
      fail("The compare-at price must be higher than the selling price.", {
        compareAtPrice: "Must be higher than the selling price.",
      });
      return;
    }
    if (draft.variants.length > MAX_VARIANTS) {
      fail(`Keep this product to ${MAX_VARIANTS} options or fewer.`);
      return;
    }
    const validatedVariants = validateVariants(draft.variants, pricePaise);
    if (!validatedVariants.variants) {
      setVariantErrors(validatedVariants.errors);
      fail("Review the highlighted product options before saving.");
      return;
    }
    if (!product && !file) {
      fail("Add a clear product image before publishing this gift.", {
        image: "Choose a product image.",
      });
      return;
    }

    setPending(true);
    let uploadedPath: VendorProduct["image"] | undefined;
    try {
      let image = product?.image;
      if (file) {
        const formData = new FormData();
        formData.set("image", file);
        const uploaded = await vendorRequest<{
          image: { path: VendorProduct["image"] };
        }>(`${apiBase}/uploads`, { method: "POST", body: formData });
        image = uploaded.image.path;
        uploadedPath = uploaded.image.path;
      }
      if (!image) throw new Error("An image is required.");
      const payload: VendorProductInput = {
        name: draft.name,
        shortDescription: draft.shortDescription,
        description: draft.description,
        category: draft.category,
        pricePaise,
        ...(compareAtPricePaise !== null ? { compareAtPricePaise } : {}),
        image,
        stock,
        featured: draft.featured,
        tags: parseCommaSeparated(draft.tags),
        recipientTags: parseCommaSeparated(draft.recipientTags),
        occasionTags: parseCommaSeparated(draft.occasionTags),
        variants: validatedVariants.variants,
        preparationTime: draft.preparationTime,
        giftWrapEligible: draft.giftWrapEligible,
        visible: draft.visible,
        ...(product ? { version: product.version } : {}),
      };
      const result = await vendorRequest<{ product: VendorProduct }>(
        product ? `${apiBase}/products/${encodeURIComponent(product.id)}` : `${apiBase}/products`,
        {
          method: product ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      onSaved(
        result.product,
        product ? "Product changes published." : "Product added to the kiosk catalogue.",
      );
      if (product?.image && product.image !== result.product.image) {
        void releaseUnusedUpload(product.image, apiBase);
      }
      onClose();
    } catch (caught) {
      await releaseUnusedUpload(uploadedPath, apiBase);
      setFieldErrors(
        caught instanceof VendorClientError ? fieldErrorsFromServer(caught.fields) : {},
      );
      setError(caught instanceof Error ? caught.message : "The product could not be saved.");
      setFailureCount((count) => count + 1);
    } finally {
      setPending(false);
    }
  };

  const archive = async () => {
    if (!product || archiving) return;
    setArchiving(true);
    setError(null);
    setFieldErrors({});
    try {
      await vendorRequest(`${apiBase}/products/${encodeURIComponent(product.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ version: product.version }),
      });
      onArchived(product.id, "Product archived. Past order snapshots remain unchanged.");
      onClose();
    } catch (caught) {
      // Close the confirmation so the editor's error summary takes focus.
      setConfirmArchive(false);
      setError(caught instanceof Error ? caught.message : "The product could not be archived.");
      setFailureCount((count) => count + 1);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <div
        className="vendor-drawer-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.currentTarget === event.target && !pending && !archiving) onClose();
        }}
      >
        <aside
          ref={drawerRef}
          className="vendor-product-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor-product-editor-title"
          tabIndex={-1}
        >
          <header className="vendor-drawer-header">
            <div>
              <h2 id="vendor-product-editor-title">
                {product ? "Edit product" : "Add a new product"}
              </h2>
              <p>
                {product
                  ? "Update catalogue details and publish them to the kiosk."
                  : "Share the details below to add a product to your store."}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              className="vendor-icon-button"
              type="button"
              onClick={onClose}
              disabled={pending || archiving}
              aria-label="Close product editor"
            >
              <X size={21} />
            </button>
          </header>

          <form ref={formRef} className="vendor-product-form" onSubmit={submit}>
            <div className="vendor-form-scroll">
              {error ? (
                <div
                  ref={errorRef}
                  tabIndex={-1}
                  className="vendor-form-error vendor-form-error--panel"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              <fieldset className="vendor-fieldset">
                <legend>Product image</legend>
                <label className={`vendor-image-upload${previewUrl ? " has-image" : ""}`}>
                  {previewUrl ? (
                    <span
                      className="vendor-image-preview"
                      role="img"
                      aria-label={`Preview of ${draft.name || "new product"}`}
                      style={{ backgroundImage: `url(${previewUrl})` }}
                    />
                  ) : (
                    <span className="vendor-image-placeholder">
                      <ImagePlus size={31} />
                      <strong>Choose a product image</strong>
                      <small>PNG or JPEG · up to 8 MB</small>
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setFieldErrors((current) => ({ ...current, image: undefined }));
                    }}
                    disabled={pending}
                    {...fieldAria("image")}
                  />
                  <span className="vendor-image-upload-action">
                    {previewUrl ? "Replace image" : "Browse files"}
                  </span>
                </label>
                {fieldError("image")}
                <p className="vendor-field-help">
                  Use a clear square or 4:3 photograph. Location metadata is removed from JPEG
                  uploads.
                </p>
              </fieldset>

              <fieldset className="vendor-fieldset vendor-form-grid">
                <legend>Product details</legend>
                <label className="vendor-field vendor-field--full">
                  <span>Name</span>
                  <input
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                    {...fieldAria("name")}
                    maxLength={120}
                    required
                  />
                  {fieldError("name")}
                </label>
                <label className="vendor-field vendor-field--full">
                  <span>Short description</span>
                  <input
                    value={draft.shortDescription}
                    onChange={(event) => update("shortDescription", event.target.value)}
                    {...fieldAria("shortDescription")}
                    maxLength={180}
                    required
                  />
                  <small>Shown on the kiosk product card.</small>
                  {fieldError("shortDescription")}
                </label>
                <label className="vendor-field vendor-field--full">
                  <span>Full description</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) => update("description", event.target.value)}
                    {...fieldAria("description")}
                    maxLength={2000}
                    rows={4}
                    required
                  />
                  {fieldError("description")}
                </label>
                <label className="vendor-field vendor-field--full">
                  <span>Category</span>
                  <input
                    list="vendor-category-options"
                    value={draft.category}
                    onChange={(event) => update("category", event.target.value)}
                    {...fieldAria("category")}
                    maxLength={80}
                    required
                  />
                  <datalist id="vendor-category-options">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                  {fieldError("category")}
                </label>
                <label className="vendor-field">
                  <span>Price (₹)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.price}
                    onChange={(event) => update("price", event.target.value)}
                    {...fieldAria("price")}
                    required
                  />
                  {fieldError("price")}
                </label>
                <label className="vendor-field">
                  <span>Compare-at price (₹)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={draft.compareAtPrice}
                    onChange={(event) => update("compareAtPrice", event.target.value)}
                    {...fieldAria("compareAtPrice")}
                    placeholder="Optional"
                  />
                  {fieldError("compareAtPrice")}
                </label>
                <label className="vendor-field">
                  <span>Stock quantity</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={draft.stock}
                    onChange={(event) => update("stock", event.target.value)}
                    {...fieldAria("stock")}
                    required
                  />
                  {fieldError("stock")}
                </label>
                <label className="vendor-field">
                  <span>Preparation note</span>
                  <input
                    value={draft.preparationTime}
                    onChange={(event) => update("preparationTime", event.target.value)}
                    {...fieldAria("preparationTime")}
                    maxLength={120}
                    required
                  />
                  {fieldError("preparationTime")}
                </label>
                <label className="vendor-field vendor-field--full">
                  <span>Search tags</span>
                  <input
                    value={draft.tags}
                    onChange={(event) => update("tags", event.target.value)}
                    {...fieldAria("tags")}
                    placeholder="personalised, wooden, anniversary"
                  />
                  <small>Separate tags with commas.</small>
                  {fieldError("tags")}
                </label>
                <label className="vendor-field">
                  <span>Occasions</span>
                  <input
                    value={draft.occasionTags}
                    onChange={(event) => update("occasionTags", event.target.value)}
                    {...fieldAria("occasionTags")}
                    placeholder="Birthday, Wedding"
                  />
                  {fieldError("occasionTags")}
                </label>
                <label className="vendor-field">
                  <span>Recipients</span>
                  <input
                    value={draft.recipientTags}
                    onChange={(event) => update("recipientTags", event.target.value)}
                    {...fieldAria("recipientTags")}
                    placeholder="For Her, For Couple"
                  />
                  {fieldError("recipientTags")}
                </label>
              </fieldset>

              <fieldset className="vendor-fieldset vendor-options-editor">
                <legend>Product options</legend>
                <div className="vendor-options-intro">
                  <div>
                    <strong>Offer a choice</strong>
                    <p>
                      Add sizes, finishes, colours, or any other choice customers should select.
                    </p>
                    <span aria-live="polite">
                      {draft.variants.length} of {MAX_VARIANTS} options
                    </span>
                  </div>
                  <button
                    className="vendor-option-add"
                    type="button"
                    onClick={addVariant}
                    disabled={pending || draft.variants.length >= MAX_VARIANTS}
                  >
                    <Plus size={16} aria-hidden="true" />
                    Add option
                  </button>
                </div>

                {draft.variants.length === 0 ? (
                  <div className="vendor-options-empty">
                    <span aria-hidden="true">
                      <Layers3 size={21} />
                    </span>
                    <div>
                      <strong>No options added</strong>
                      <p>Customers will order this product using its main price and stock.</p>
                    </div>
                  </div>
                ) : (
                  <div className="vendor-option-list">
                    {draft.variants.map((variant, index) => {
                      const rowErrors = variantErrors[variant.clientKey];
                      const fieldPrefix = `vendor-option-${index}`;
                      const finalPrice = variantFinalPrice(draft.price, variant.priceAdjustment);
                      return (
                        <section
                          className={`vendor-option-card${rowErrors ? " has-error" : ""}`}
                          key={variant.clientKey}
                          role="group"
                          aria-labelledby={`${fieldPrefix}-title`}
                        >
                          <header className="vendor-option-card-header">
                            <div>
                              <span className="vendor-option-number" aria-hidden="true">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <div>
                                <strong id={`${fieldPrefix}-title`}>
                                  {variant.name.trim() || `Option ${index + 1}`}
                                </strong>
                                <small>Choice shown on the kiosk</small>
                              </div>
                            </div>
                            <button
                              className="vendor-option-remove"
                              type="button"
                              onClick={() => removeVariant(variant.clientKey)}
                              disabled={pending}
                              aria-label={`Remove ${variant.name.trim() || `option ${index + 1}`}`}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </header>

                          {rowErrors?.row ? (
                            <p className="vendor-option-row-error" role="alert">
                              {rowErrors.row}
                            </p>
                          ) : null}

                          <div className="vendor-option-fields">
                            <div className="vendor-field vendor-option-name">
                              <label htmlFor={`${fieldPrefix}-name`}>Option name</label>
                              <input
                                id={`${fieldPrefix}-name`}
                                value={variant.name}
                                onChange={(event) =>
                                  updateVariant(variant.clientKey, "name", event.target.value)
                                }
                                maxLength={120}
                                placeholder="e.g. Walnut finish"
                                aria-invalid={Boolean(rowErrors?.name) || undefined}
                                aria-describedby={
                                  rowErrors?.name ? `${fieldPrefix}-name-error` : undefined
                                }
                              />
                              {rowErrors?.name ? (
                                <small
                                  className="vendor-field-error"
                                  id={`${fieldPrefix}-name-error`}
                                >
                                  {rowErrors.name}
                                </small>
                              ) : null}
                            </div>

                            <div className="vendor-field">
                              <label htmlFor={`${fieldPrefix}-adjustment`}>
                                Price adjustment (₹)
                              </label>
                              <input
                                id={`${fieldPrefix}-adjustment`}
                                type="number"
                                inputMode="decimal"
                                min="-1000000"
                                max="1000000"
                                step="0.01"
                                value={variant.priceAdjustment}
                                onChange={(event) =>
                                  updateVariant(
                                    variant.clientKey,
                                    "priceAdjustment",
                                    event.target.value,
                                  )
                                }
                                aria-invalid={Boolean(rowErrors?.priceAdjustment) || undefined}
                                aria-describedby={
                                  rowErrors?.priceAdjustment
                                    ? `${fieldPrefix}-adjustment-error`
                                    : `${fieldPrefix}-adjustment-help`
                                }
                              />
                              {rowErrors?.priceAdjustment ? (
                                <small
                                  className="vendor-field-error"
                                  id={`${fieldPrefix}-adjustment-error`}
                                >
                                  {rowErrors.priceAdjustment}
                                </small>
                              ) : (
                                <small id={`${fieldPrefix}-adjustment-help`}>
                                  Use a minus amount for a lower-priced option.
                                </small>
                              )}
                            </div>

                            <div className="vendor-field">
                              <label htmlFor={`${fieldPrefix}-stock`}>Option stock</label>
                              <input
                                id={`${fieldPrefix}-stock`}
                                type="number"
                                inputMode="numeric"
                                min="0"
                                max={MAX_STOCK}
                                step="1"
                                value={variant.stock}
                                onChange={(event) =>
                                  updateVariant(variant.clientKey, "stock", event.target.value)
                                }
                                placeholder="Use product stock"
                                aria-invalid={Boolean(rowErrors?.stock) || undefined}
                                aria-describedby={
                                  rowErrors?.stock
                                    ? `${fieldPrefix}-stock-error`
                                    : `${fieldPrefix}-stock-help`
                                }
                              />
                              {rowErrors?.stock ? (
                                <small
                                  className="vendor-field-error"
                                  id={`${fieldPrefix}-stock-error`}
                                >
                                  {rowErrors.stock}
                                </small>
                              ) : (
                                <small id={`${fieldPrefix}-stock-help`}>
                                  Leave blank to share the main stock quantity.
                                </small>
                              )}
                            </div>
                          </div>

                          <footer
                            className={`vendor-option-price${finalPrice ? "" : " is-unavailable"}`}
                            aria-live="polite"
                          >
                            <span>Customer price</span>
                            <strong>{finalPrice ?? "Check price"}</strong>
                          </footer>
                        </section>
                      );
                    })}
                  </div>
                )}
              </fieldset>

              <fieldset className="vendor-fieldset vendor-toggle-stack">
                <legend>Kiosk presentation</legend>
                <label className="vendor-toggle-row">
                  <span>
                    <strong>Show on kiosk</strong>
                    <small>Visible products appear in the customer catalogue.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.visible}
                    onChange={(event) => update("visible", event.target.checked)}
                  />
                  <i aria-hidden="true" />
                </label>
                <label className="vendor-toggle-row">
                  <span>
                    <strong>Gift wrapping</strong>
                    <small>Allow customers to add the configured wrap service.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.giftWrapEligible}
                    onChange={(event) => update("giftWrapEligible", event.target.checked)}
                  />
                  <i aria-hidden="true" />
                </label>
                <label className="vendor-toggle-row">
                  <span>
                    <strong>Featured gift</strong>
                    <small>Give this product priority in catalogue discovery.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(event) => update("featured", event.target.checked)}
                  />
                  <i aria-hidden="true" />
                </label>
              </fieldset>

              {product ? (
                <div className="vendor-archive-zone">
                  <div>
                    <strong>Archive this product</strong>
                    <p id="vendor-archive-consequence">
                      It disappears from the kiosk, while previous order records keep their original
                      product snapshot.
                    </p>
                  </div>
                  <button
                    className="vendor-quiet"
                    type="button"
                    onClick={() => setConfirmArchive(true)}
                    disabled={pending || archiving}
                    aria-describedby="vendor-archive-consequence"
                    aria-haspopup="dialog"
                  >
                    <Archive size={17} />
                    Archive
                  </button>
                </div>
              ) : null}
            </div>

            <footer className="vendor-drawer-footer">
              <button
                className="vendor-secondary"
                type="button"
                onClick={onClose}
                disabled={pending || archiving}
              >
                Cancel
              </button>
              <button className="vendor-primary" type="submit" disabled={pending || archiving}>
                {pending ? (
                  <LoaderCircle className="vendor-spin" size={18} />
                ) : (
                  <PackageCheck size={18} />
                )}
                {pending ? "Saving…" : product ? "Save changes" : "Save product"}
              </button>
            </footer>
          </form>
        </aside>
      </div>
      {confirmArchive && product ? (
        <ConfirmDialog
          title="Archive this product?"
          description={`“${product.name}” will be removed from the kiosk and the catalogue. This cannot be undone here. Previous order records keep their original product snapshot.`}
          confirmLabel="Archive product"
          pendingLabel="Archiving…"
          pending={archiving}
          onConfirm={archive}
          onCancel={() => setConfirmArchive(false)}
        />
      ) : null}
    </>
  );
}
