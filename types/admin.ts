export type AdminVendorStatus = "active" | "suspended";

export type PlatformAdminUser = Readonly<{
  id: string;
  email: string;
  name: string;
  role: "super_admin";
}>;

export type AdminVendorOwner = Readonly<{
  id: string;
  name: string;
  email: string;
}>;

export type AdminVendorSummary = Readonly<{
  id: string;
  slug: string;
  displayName: string;
  status: AdminVendorStatus;
  revision: number;
  owner: AdminVendorOwner;
  productCount: number;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}>;

export type AdminPlatformMetrics = Readonly<{
  totalVendors: number;
  activeVendors: number;
  orderCount: number;
  productCount: number;
}>;

export type AdminActivityKind =
  | "vendor_created"
  | "vendor_suspended"
  | "vendor_reactivated"
  | "order"
  | "product"
  | "account"
  | "settings";

export type AdminActivityItem = Readonly<{
  id: string;
  kind: AdminActivityKind;
  title: string;
  detail: string;
  createdAt: string;
  vendorId?: string;
}>;

export type AdminBootstrap = Readonly<{
  user: PlatformAdminUser;
  metrics: AdminPlatformMetrics;
  vendors: readonly AdminVendorSummary[];
  recentActivity: readonly AdminActivityItem[];
}>;

export type CreateAdminVendorInput = Readonly<{
  displayName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerWhatsAppNumber: string;
  temporaryPassword: string;
}>;

export type AdminVendorMutationResult = Readonly<{
  vendor: AdminVendorSummary;
  metrics: AdminPlatformMetrics;
  activity: AdminActivityItem;
}>;
