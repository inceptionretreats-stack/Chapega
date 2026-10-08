import type {
  CustomerDetails,
  PresenterSettings,
  Product,
  ProductImagePath,
  ProductVariant,
} from "@/types/kiosk";

export type VendorRole = "owner" | "manager" | "staff";

export type PlatformRole = "super_admin";

export type VendorStatus = "active" | "suspended";

export type VendorCapability =
  | "view_dashboard"
  | "manage_orders"
  | "manage_catalogue"
  | "manage_settings"
  | "manage_team";

export type VendorCapabilities = Readonly<Record<VendorCapability, boolean>>;

export type VendorIdentity = Readonly<{
  id: string;
  slug: string;
  displayName: string;
  status: VendorStatus;
}>;

export type VendorMembership = Readonly<{
  vendor: VendorIdentity;
  role: VendorRole;
  active: boolean;
  isDefault: boolean;
}>;

export type VendorUser = Readonly<{
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole | null;
  /** The role for the active vendor. Kept as a direct field for UI ergonomics. */
  role: VendorRole;
  activeVendor: VendorIdentity;
  memberships: readonly VendorMembership[];
  capabilities: VendorCapabilities;
}>;

/**
 * A trusted, server-derived tenant boundary. Route handlers must build this
 * from a valid session and must never accept it from request JSON.
 */
export type VendorAccessContext = Readonly<{
  user: VendorUser;
  vendor: VendorIdentity;
  membership: Readonly<{
    vendorId: string;
    userId: string;
    role: VendorRole;
  }>;
  capabilities: VendorCapabilities;
}>;

export type VendorOrderStatus =
  "prepared" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";

export type VendorOrderItem = Readonly<{
  productId: string;
  name: string;
  image: ProductImagePath;
  variantId?: string;
  variant?: string;
  quantity: number;
  unitPricePaise: number;
  giftWrapped: boolean;
  lineTotalPaise: number;
}>;

export type VendorOrderEvent = Readonly<{
  id: string;
  from: VendorOrderStatus | null;
  to: VendorOrderStatus;
  actorName: string;
  createdAt: string;
  note?: string;
}>;

export type VendorOrder = Readonly<{
  id: string;
  orderNumber: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  customer: CustomerDetails;
  kioskName: string;
  paymentMethod: "pay_later";
  items: readonly VendorOrderItem[];
  subtotalPaise: number;
  giftWrapPaise: number;
  totalPaise: number;
  whatsappMessage: string;
  whatsappUrl: string;
  status: VendorOrderStatus;
  version: number;
  inventoryCommitted: boolean;
  events: readonly VendorOrderEvent[];
}>;

export type VendorProduct = Product &
  Readonly<{
    visible: boolean;
    archived: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
  }>;

export type VendorProductInput = Readonly<{
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  pricePaise: number;
  compareAtPricePaise?: number;
  image: ProductImagePath;
  stock: number;
  featured: boolean;
  tags: readonly string[];
  recipientTags: readonly string[];
  occasionTags: readonly string[];
  variants?: readonly ProductVariant[];
  preparationTime: string;
  giftWrapEligible: boolean;
  visible: boolean;
  version?: number;
}>;

export type VendorSettings = PresenterSettings &
  Readonly<{
    storeOpen: boolean;
    lowStockThreshold: number;
    version: number;
    updatedAt: string;
  }>;

export type VendorBootstrap = Readonly<{
  user: VendorUser;
  vendor: VendorIdentity;
  capabilities: VendorCapabilities;
  revision: number;
  products: readonly VendorProduct[];
  orders: readonly VendorOrder[];
  settings: VendorSettings;
}>;

export type KioskOrderSubmission = Readonly<{
  idempotencyKey: string;
  orderNumber: string;
  createdAt: string;
  kioskName: string;
  customer: CustomerDetails;
  items: readonly Readonly<{
    productId: string;
    variantId?: string;
    quantity: number;
    giftWrapped: boolean;
  }>[];
}>;
