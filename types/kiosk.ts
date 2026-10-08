/** Product categories are catalogue data, not a closed application enum. */
export type ProductCategory = string;

export type CategoryFilter = "all" | ProductCategory;

export type KioskScreen =
  | "welcome"
  | "catalogue"
  | "product-details"
  | "cart"
  | "customer"
  | "checkout"
  | "review"
  | "qr"
  | "presenter"
  | "approval";

export type ProductAvailability = "available" | "low_stock" | "unavailable";

export type ProductVariant = Readonly<{
  id: string;
  name: string;
  priceAdjustmentPaise: number;
  stock?: number;
}>;

type ProductImageDirectory =
  "products" | "generated-products" | "vendor-products";

export type ProductImagePath =
  `/${ProductImageDirectory}/${string}.${"webp" | "jpeg" | "jpg" | "png"}`;

export type Product = Readonly<{
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  category: ProductCategory;
  pricePaise: number;
  compareAtPricePaise?: number;
  image: ProductImagePath;
  availability: ProductAvailability;
  stock: number;
  featured: boolean;
  tags: readonly string[];
  recipientTags: readonly string[];
  occasionTags: readonly string[];
  variants: readonly ProductVariant[];
  preparationTime: string;
  giftWrapEligible: boolean;
}>;

export type CartLine = Readonly<{
  key: string;
  productId: string;
  productName: string;
  productImage: Product["image"];
  variantId?: string;
  variantName?: string;
  quantity: number;
  unitPricePaise: number;
  giftWrapped: boolean;
  productStockLimit: number;
  variantStockLimit?: number;
  stockLimit: number;
}>;

export type CartTotals = Readonly<{
  subtotalPaise: number;
  giftWrapPaise: number;
  totalPaise: number;
}>;

export type CartErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "VARIANT_REQUIRED"
  | "INVALID_VARIANT"
  | "GIFT_WRAP_NOT_ALLOWED"
  | "INVALID_QUANTITY"
  | "OUT_OF_STOCK"
  | "MAX_UNITS_EXCEEDED"
  | "LINE_NOT_FOUND";

export type CartError = Readonly<{
  code: CartErrorCode;
  message: string;
  maxUnits?: number;
  remainingCapacity?: number;
  availableStock?: number;
}>;

export type Result<T, E> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;

export type CartMutation = Readonly<{
  items: readonly CartLine[];
  unitCount: number;
  remainingCapacity: number;
}>;

export type CartResult = Result<CartMutation, CartError>;

export type CustomerDetails = Readonly<{
  customerName: string;
  customerPhone: string;
  giftNote: string;
  orderNote: string;
}>;

export type PresenterSettings = Readonly<{
  shopName: string;
  ownerWhatsAppNumber: string;
  defaultCountryCode: string;
  kioskName: string;
  maxCartQuantity: number;
  giftWrapFeePaise: number;
  qrResetSeconds: number;
  showPreviewLabel: boolean;
}>;

export type SettingsError = Readonly<{
  code: "INVALID_SETTINGS" | "INVALID_OWNER_NUMBER";
  message: string;
}>;

export type SettingsResult = Result<PresenterSettings, SettingsError>;

export type OrderStatus = "prepared_for_whatsapp" | "presenter_marked_sent";

export type OrderItem = Readonly<{
  productId: string;
  name: string;
  variant?: string;
  quantity: number;
  unitPricePaise: number;
  giftWrapped: boolean;
  lineTotalPaise: number;
}>;

export type Order = Readonly<{
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  giftNote?: string;
  orderNote?: string;
  kioskName: string;
  paymentMethod: "pay_later";
  items: readonly OrderItem[];
  subtotalPaise: number;
  giftWrapPaise: number;
  totalPaise: number;
  whatsappMessage: string;
  whatsappUrl: string;
  status: OrderStatus;
}>;

/** A privacy-safe order summary suitable for long-lived localStorage. */
export type OrderHistoryItem = Readonly<{
  orderNumber: string;
  createdAt: string;
  kioskName: string;
  itemCount: number;
  totalPaise: number;
  status: OrderStatus;
}>;

export type OrderErrorCode =
  | "EMPTY_CART"
  | "MAX_UNITS_EXCEEDED"
  | "INVALID_CART"
  | "INVALID_CUSTOMER_PHONE"
  | "OWNER_NUMBER_REQUIRED"
  | "INVALID_OWNER_NUMBER";

export type OrderError = Readonly<{
  code: OrderErrorCode;
  message: string;
}>;

export type OrderResult = Result<Order, OrderError>;

export type KioskBootstrap = Readonly<{
  vendor: Readonly<{
    id: string;
    slug: string;
    displayName: string;
  }>;
  revision: string;
  products: readonly Product[];
  settings: PresenterSettings;
  storeOpen: boolean;
  syncedAt: string;
}>;
