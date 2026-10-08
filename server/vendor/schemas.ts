import { z } from "zod";
import { optionalCustomerPhoneError } from "@/domain/customer";
import { normalizeWhatsAppNumber } from "@/domain/whatsapp";
import type { ProductImagePath } from "@/types/kiosk";

const trimmed = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalTrimmed = (maximum: number) =>
  z.string().trim().max(maximum).optional().default("");

export const vendorSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(72)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Choose a valid vendor workspace.");

const imagePathSchema = z
  .string()
  .regex(
    /^\/(?:(?:products|generated-products)\/[a-zA-Z0-9._-]+\.(?:png|jpe?g|webp)|vendor-products\/(?:(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/)?[a-f0-9]{64}\.(?:png|jpg))$/i,
    "Choose a valid uploaded product image.",
  )
  .transform((value) => value as ProductImagePath);

const productVariantSchema = z
  .object({
    id: trimmed(100),
    name: trimmed(120),
    priceAdjustmentPaise: z.number().int().min(-100_000_000).max(100_000_000),
    stock: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(160),
    password: z.string().min(8).max(200),
    vendorSlug: vendorSlugSchema.optional(),
  })
  .strict();

export const vendorProductSchema = z
  .object({
    name: trimmed(120),
    shortDescription: trimmed(180),
    description: trimmed(2_000),
    category: trimmed(80),
    pricePaise: z.number().int().min(0).max(100_000_000),
    compareAtPricePaise: z.number().int().min(0).max(100_000_000).optional(),
    image: imagePathSchema,
    stock: z.number().int().min(0).max(100_000),
    featured: z.boolean(),
    tags: z.array(trimmed(48)).max(20).default([]),
    recipientTags: z.array(trimmed(48)).max(20).default([]),
    occasionTags: z.array(trimmed(48)).max(20).default([]),
    // Omitted on update means "keep the current variants"; a create treats it
    // as none. Defaulting to [] here silently erased variants (AUD-9).
    variants: z.array(productVariantSchema).max(20).optional(),
    preparationTime: trimmed(120),
    giftWrapEligible: z.boolean(),
    visible: z.boolean(),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.compareAtPricePaise !== undefined &&
      value.compareAtPricePaise <= value.pricePaise
    ) {
      context.addIssue({
        code: "custom",
        path: ["compareAtPricePaise"],
        message: "The comparison price must be higher than the selling price.",
      });
    }

    const variantIds = new Set<string>();
    const variantNames = new Set<string>();
    for (const [index, variant] of (value.variants ?? []).entries()) {
      const normalizedId = variant.id.toLowerCase();
      if (variantIds.has(normalizedId)) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "id"],
          message: "Each variant ID must be unique.",
        });
      }
      variantIds.add(normalizedId);

      const normalizedName = variant.name.toLowerCase();
      if (variantNames.has(normalizedName)) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "name"],
          message: "Each variant name must be unique.",
        });
      }
      variantNames.add(normalizedName);

      if (value.pricePaise + variant.priceAdjustmentPaise < 0) {
        context.addIssue({
          code: "custom",
          path: ["variants", index, "priceAdjustmentPaise"],
          message: "A variant's final selling price cannot be negative.",
        });
      }
    }
  });

export const vendorSettingsSchema = z
  .object({
    shopName: trimmed(80),
    ownerWhatsAppNumber: z.string().trim().min(8).max(24),
    defaultCountryCode: z.string().regex(/^[1-9]\d{0,2}$/),
    kioskName: trimmed(80),
    maxCartQuantity: z.number().int().min(1).max(5),
    giftWrapFeePaise: z.number().int().min(0).max(100_000),
    qrResetSeconds: z.number().int().min(15).max(3_600),
    showPreviewLabel: z.boolean(),
    storeOpen: z.boolean(),
    lowStockThreshold: z.number().int().min(0).max(999),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      normalizeWhatsAppNumber(
        value.ownerWhatsAppNumber,
        value.defaultCountryCode,
      );
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["ownerWhatsAppNumber"],
        message:
          error instanceof Error
            ? error.message
            : "Enter a valid WhatsApp number.",
      });
    }
  });

const customerSchema = z
  .object({
    customerName: optionalTrimmed(80),
    customerPhone: optionalTrimmed(30),
    giftNote: optionalTrimmed(240),
    orderNote: optionalTrimmed(240),
  })
  .strict()
  .superRefine((value, context) => {
    const message = optionalCustomerPhoneError(value.customerPhone);
    if (message) {
      context.addIssue({
        code: "custom",
        path: ["customerPhone"],
        message,
      });
    }
  });

export const kioskOrderSubmissionSchema = z
  .object({
    idempotencyKey: trimmed(100),
    // Older kiosks still send these; the server assigns its own number and time.
    orderNumber: z
      .string()
      .regex(/^GFT-\d{8}-\d{4,6}$/)
      .max(40)
      .optional(),
    createdAt: z.string().datetime().optional(),
    kioskName: trimmed(80),
    customer: customerSchema,
    items: z
      .array(
        z
          .object({
            productId: trimmed(140),
            variantId: trimmed(140).optional(),
            quantity: z.number().int().min(1).max(5),
            giftWrapped: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict()
  .refine(
    (value) =>
      value.items.reduce((total, item) => total + item.quantity, 0) <= 5,
    { message: "A kiosk order can contain at most five gift units." },
  );

export const orderTransitionSchema = z
  .object({
    status: z.enum([
      "prepared",
      "confirmed",
      "preparing",
      "ready",
      "completed",
      "cancelled",
    ]),
    version: z.number().int().positive(),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type VendorProductPayload = z.infer<typeof vendorProductSchema>;
export type VendorSettingsPayload = z.infer<typeof vendorSettingsSchema>;
export type KioskOrderPayload = z.infer<typeof kioskOrderSubmissionSchema>;
export type OrderTransitionPayload = z.infer<typeof orderTransitionSchema>;
