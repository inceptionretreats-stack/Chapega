"use client";

import { create } from "zustand";

import {
  CATALOGUE_PRODUCTS,
} from "@/data/catalogue";
import {
  addCartItem,
  getCartUnitCount,
  getRemainingCartCapacity,
  removeCartLine,
  setCartLineGiftWrapped,
  setCartLineQuantity,
  type AddCartItemOptions,
} from "@/domain/cart";
import { calculateCartTotals } from "@/domain/money";
import {
  createOrder,
  markOrderAsPresenterSent,
  redactOrderForHistory,
} from "@/domain/order";
import {
  normalizeWhatsAppNumber,
  WhatsAppNumberError,
} from "@/domain/whatsapp";
import {
  type CartError,
  type CartLine,
  type CartResult,
  type CartTotals,
  type CategoryFilter,
  type CustomerDetails,
  type KioskBootstrap,
  type KioskScreen,
  type Order,
  type OrderError,
  type OrderHistoryItem,
  type OrderResult,
  type PresenterSettings,
  type Product,
  type SettingsResult,
} from "@/types/kiosk";

export const PRESENTER_SETTINGS_STORAGE_KEY =
  "gift-kiosk-presenter-settings";
export const ORDERS_STORAGE_KEY = "gift-kiosk-orders";
export const ACTIVE_SESSION_STORAGE_KEY = "gift-kiosk-active-session";
export const CATALOGUE_REVISION_STORAGE_KEY = "gift-kiosk-catalogue-revision";
export const CURRENT_CATALOGUE_REVISION = "supplied-catalogue-2026-08-10-v1";
export const MAX_ORDER_HISTORY = 20;
const MAX_ORDER_ID_LENGTH = 100;
export const KIOSK_IDLE_TIMEOUT_MS = 2 * 60 * 1_000;
export const KIOSK_IDLE_WARNING_MS = 30 * 1_000;
/** Upper bound for the QR privacy countdown, even after "keep open". */
export const QR_MAX_TOTAL_SECONDS = 5 * 60;

const LEGACY_DEFAULT_SHOP_NAMES: readonly string[] = Object.freeze([
  "Gift House",
  "Chhaipika.com",
  "chapeka.com",
  "Chhapega.com",
]);

export const DEFAULT_PRESENTER_SETTINGS: PresenterSettings = Object.freeze({
  shopName: "Chapega.com",
  ownerWhatsAppNumber: "",
  defaultCountryCode: "91",
  kioskName: "Main Entrance",
  maxCartQuantity: 5,
  giftWrapFeePaise: 2_500,
  qrResetSeconds: 120,
  showPreviewLabel: false,
});

export const EMPTY_CUSTOMER_DETAILS: CustomerDetails = Object.freeze({
  customerName: "",
  customerPhone: "",
  giftNote: "",
  orderNote: "",
});

const KIOSK_SCREENS: readonly KioskScreen[] = [
  "welcome",
  "catalogue",
  "product-details",
  "cart",
  "customer",
  "checkout",
  "review",
  "qr",
  "approval",
];

type StorageKind = "local" | "session";

const memoryStorage: Record<StorageKind, Map<string, string>> = {
  local: new Map<string, string>(),
  session: new Map<string, string>(),
};

function normalizedTenantKey(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-IN").replace(/[^a-z0-9-]/g, "-");
  return normalized.replace(/-+/g, "-").replace(/^-|-$/g, "") || "chapega";
}

export function kioskStorageKey(baseKey: string, tenantKey: string): string {
  return `${baseKey}:${normalizedTenantKey(tenantKey)}`;
}

function nativeStorage(kind: StorageKind): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readStorage(
  kind: StorageKind,
  key: string,
): Readonly<{ value: string | null; available: boolean }> {
  const storage = nativeStorage(kind);
  if (!storage) {
    return {
      value: memoryStorage[kind].get(key) ?? null,
      available: false,
    };
  }

  try {
    const value = storage.getItem(key);
    return {
      value: value ?? memoryStorage[kind].get(key) ?? null,
      available: true,
    };
  } catch {
    return {
      value: memoryStorage[kind].get(key) ?? null,
      available: false,
    };
  }
}

function writeStorage(kind: StorageKind, key: string, value: string): boolean {
  memoryStorage[kind].set(key, value);
  const storage = nativeStorage(kind);
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(kind: StorageKind, key: string): boolean {
  memoryStorage[kind].delete(key);
  const storage = nativeStorage(kind);
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function resetLegacyDataForCurrentCatalogue(tenantKey: string): boolean {
  const revisionKey = kioskStorageKey(CATALOGUE_REVISION_STORAGE_KEY, tenantKey);
  const ordersKey = kioskStorageKey(ORDERS_STORAGE_KEY, tenantKey);
  const sessionKey = kioskStorageKey(ACTIVE_SESSION_STORAGE_KEY, tenantKey);
  const revisionRead = readStorage("local", revisionKey);
  if (revisionRead.value === CURRENT_CATALOGUE_REVISION) {
    return revisionRead.available;
  }

  const results = [
    removeStorage("local", ordersKey),
    removeStorage("local", "gift-kiosk-demo-orders"),
    removeStorage("local", "gift-kiosk-setup-dismissed"),
    removeStorage("local", "gift-kiosk-setup-dismissed-v2"),
    removeStorage("session", sessionKey),
    // Pre-tenant browser data had no ownership marker. Clear it during the
    // v4 cutover instead of risking its restoration in the wrong storefront.
    removeStorage("local", ORDERS_STORAGE_KEY),
    removeStorage("local", PRESENTER_SETTINGS_STORAGE_KEY),
    removeStorage("session", ACTIVE_SESSION_STORAGE_KEY),
    writeStorage(
      "local",
      revisionKey,
      CURRENT_CATALOGUE_REVISION,
    ),
  ];

  return revisionRead.available && results.every(Boolean);
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isSafeInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
    ? Number(value)
    : fallback;
}

function parseSettings(value: unknown): PresenterSettings {
  if (!isRecord(value)) {
    return DEFAULT_PRESENTER_SETTINGS;
  }

  const countryCode = stringValue(
    value.defaultCountryCode,
    DEFAULT_PRESENTER_SETTINGS.defaultCountryCode,
  )
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  const safeCountryCode =
    countryCode.length >= 1 && countryCode.length <= 3
      ? countryCode
      : DEFAULT_PRESENTER_SETTINGS.defaultCountryCode;
  const rawOwnerNumber = stringValue(value.ownerWhatsAppNumber).trim();
  let ownerWhatsAppNumber = "";
  if (rawOwnerNumber) {
    try {
      ownerWhatsAppNumber = normalizeWhatsAppNumber(
        rawOwnerNumber,
        safeCountryCode,
      );
    } catch {
      ownerWhatsAppNumber = "";
    }
  }

  const storedShopName = stringValue(value.shopName).trim().slice(0, 80);

  return Object.freeze({
    shopName:
      LEGACY_DEFAULT_SHOP_NAMES.includes(storedShopName)
        ? DEFAULT_PRESENTER_SETTINGS.shopName
        : storedShopName || DEFAULT_PRESENTER_SETTINGS.shopName,
    ownerWhatsAppNumber,
    defaultCountryCode: safeCountryCode,
    kioskName:
      stringValue(value.kioskName).trim().slice(0, 80) ||
      DEFAULT_PRESENTER_SETTINGS.kioskName,
    maxCartQuantity: boundedInteger(
      value.maxCartQuantity,
      DEFAULT_PRESENTER_SETTINGS.maxCartQuantity,
      1,
      5,
    ),
    giftWrapFeePaise: boundedInteger(
      value.giftWrapFeePaise,
      DEFAULT_PRESENTER_SETTINGS.giftWrapFeePaise,
      0,
      100_000,
    ),
    qrResetSeconds: boundedInteger(
      value.qrResetSeconds,
      DEFAULT_PRESENTER_SETTINGS.qrResetSeconds,
      15,
      3_600,
    ),
    showPreviewLabel:
      typeof value.showPreviewLabel === "boolean"
        ? value.showPreviewLabel
        : DEFAULT_PRESENTER_SETTINGS.showPreviewLabel,
  });
}

function parseHistoryItem(value: unknown): OrderHistoryItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status = value.status;
  if (
    typeof value.orderNumber !== "string" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    typeof value.kioskName !== "string" ||
    !isPositiveInteger(value.itemCount) ||
    !isNonNegativeInteger(value.totalPaise) ||
    (status !== "prepared_for_whatsapp" &&
      status !== "presenter_marked_sent")
  ) {
    return undefined;
  }

  return Object.freeze({
    orderNumber: value.orderNumber.slice(0, 40),
    createdAt: value.createdAt,
    kioskName: value.kioskName.slice(0, 80),
    itemCount: value.itemCount,
    totalPaise: value.totalPaise,
    status,
  });
}

function parseHistory(value: unknown): readonly OrderHistoryItem[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(
    value
      .map(parseHistoryItem)
      .filter((item): item is OrderHistoryItem => Boolean(item))
      .slice(0, MAX_ORDER_HISTORY),
  );
}

function isMatchingWhatsAppSnapshotUrl(
  rawUrl: string,
  message: string,
): boolean {
  try {
    const url = new URL(rawUrl);
    const queryEntries = [...url.searchParams.entries()];
    return (
      url.protocol === "https:" &&
      url.hostname === "wa.me" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /^\/\d{10,15}$/.test(url.pathname) &&
      queryEntries.length === 1 &&
      queryEntries[0][0] === "text" &&
      queryEntries[0][1] === message
    );
  } catch {
    return false;
  }
}

function parseOrder(value: unknown): Order | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  const status = value.status;
  if (
    typeof value.id !== "string" ||
    value.id.length < 1 ||
    value.id.length > MAX_ORDER_ID_LENGTH ||
    typeof value.orderNumber !== "string" ||
    !/^GFT(?:-DEMO)?-\d{8}-\d{4,6}$/.test(value.orderNumber) ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    typeof value.kioskName !== "string" ||
    value.paymentMethod !== "pay_later" ||
    !isNonNegativeInteger(value.subtotalPaise) ||
    !isNonNegativeInteger(value.giftWrapPaise) ||
    !isNonNegativeInteger(value.totalPaise) ||
    value.totalPaise !== value.subtotalPaise + value.giftWrapPaise ||
    typeof value.whatsappMessage !== "string" ||
    !value.whatsappMessage.trim() ||
    typeof value.whatsappUrl !== "string" ||
    !isMatchingWhatsAppSnapshotUrl(
      value.whatsappUrl,
      value.whatsappMessage,
    ) ||
    !value.whatsappMessage
      .split("\n")
      .some((line) => line === `Order: ${value.orderNumber}`) ||
    (status !== "prepared_for_whatsapp" &&
      status !== "presenter_marked_sent")
  ) {
    return null;
  }

  const items = value.items
    .map((item): Order["items"][number] | undefined => {
      if (
        !isRecord(item) ||
        typeof item.productId !== "string" ||
        typeof item.name !== "string" ||
        (item.variant !== undefined && typeof item.variant !== "string") ||
        !isPositiveInteger(item.quantity) ||
        !isNonNegativeInteger(item.unitPricePaise) ||
        typeof item.giftWrapped !== "boolean" ||
        !isNonNegativeInteger(item.lineTotalPaise) ||
        item.lineTotalPaise !== item.unitPricePaise * item.quantity
      ) {
        return undefined;
      }

      return Object.freeze({
        productId: item.productId,
        name: item.name,
        variant: item.variant,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        giftWrapped: item.giftWrapped,
        lineTotalPaise: item.lineTotalPaise,
      });
    })
    .filter(
      (item): item is Order["items"][number] => item !== undefined,
    );

  if (
    items.length !== value.items.length ||
    items.length === 0 ||
    items.reduce((total, item) => total + item.quantity, 0) > 5 ||
    items.reduce((total, item) => total + item.lineTotalPaise, 0) !==
      value.subtotalPaise
  ) {
    return null;
  }

  const wrappedUnits = items.reduce(
    (total, item) => total + (item.giftWrapped ? item.quantity : 0),
    0,
  );
  if (
    (wrappedUnits === 0 && value.giftWrapPaise !== 0) ||
    (wrappedUnits > 0 && value.giftWrapPaise % wrappedUnits !== 0)
  ) {
    return null;
  }

  return Object.freeze({
    id: value.id,
    orderNumber: value.orderNumber,
    createdAt: value.createdAt,
    customerName:
      typeof value.customerName === "string" ? value.customerName : undefined,
    customerPhone:
      typeof value.customerPhone === "string" ? value.customerPhone : undefined,
    giftNote:
      typeof value.giftNote === "string" ? value.giftNote : undefined,
    orderNote:
      typeof value.orderNote === "string" ? value.orderNote : undefined,
    kioskName: value.kioskName,
    paymentMethod: "pay_later",
    items: Object.freeze(items),
    subtotalPaise: value.subtotalPaise,
    giftWrapPaise: value.giftWrapPaise,
    totalPaise: value.totalPaise,
    whatsappMessage: value.whatsappMessage,
    whatsappUrl: value.whatsappUrl,
    status,
  });
}

/**
 * RFC 4122 v4 UUID. `crypto.randomUUID` only exists in secure contexts, and a
 * kiosk may be served over plain HTTP on a LAN, so fall back to
 * `getRandomValues`, which is available everywhere.
 */
function createIdempotencyKey(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

type PendingOrderSubmission = Readonly<{
  /** Sent as the idempotency key on every retry of this exact submission. */
  idempotencyKey: string;
  order: Order;
  customer: CustomerDetails;
  items: readonly Readonly<{
    productId: string;
    variantId?: string;
    quantity: number;
    giftWrapped: boolean;
  }>[];
}>;

function parsePendingOrderSubmission(
  value: unknown,
): PendingOrderSubmission | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const order = parseOrder(value.order);
  if (!order || value.items.length < 1 || value.items.length > 5) return null;

  const items: Array<PendingOrderSubmission["items"][number]> = [];
  let unitCount = 0;
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      typeof item.productId !== "string" ||
      !item.productId.trim() ||
      (item.variantId !== undefined && typeof item.variantId !== "string") ||
      !isPositiveInteger(item.quantity) ||
      item.quantity > 5 ||
      typeof item.giftWrapped !== "boolean"
    ) {
      return null;
    }
    unitCount += item.quantity;
    items.push(
      Object.freeze({
        productId: item.productId,
        ...(typeof item.variantId === "string"
          ? { variantId: item.variantId }
          : {}),
        quantity: item.quantity,
        giftWrapped: item.giftWrapped,
      }),
    );
  }
  if (unitCount > 5) return null;

  const storedKey = value.idempotencyKey;
  const idempotencyKey =
    typeof storedKey === "string" &&
    storedKey.trim().length > 0 &&
    storedKey.length <= MAX_ORDER_ID_LENGTH
      ? storedKey
      : // Sessions saved before the random key existed used the order id.
        order.id;

  return Object.freeze({
    idempotencyKey,
    order,
    customer: parseCustomer(value.customer),
    items: Object.freeze(items),
  });
}

function restoreCart(
  value: unknown,
  settings: PresenterSettings,
  products: readonly Product[],
): readonly CartLine[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  let restored: readonly CartLine[] = [];
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.productId !== "string" ||
      (candidate.variantId !== undefined &&
        typeof candidate.variantId !== "string") ||
      !isPositiveInteger(candidate.quantity) ||
      typeof candidate.giftWrapped !== "boolean"
    ) {
      continue;
    }

    const product = products.find((item) => item.id === candidate.productId);
    if (!product) {
      continue;
    }

    const result = addCartItem(
      restored,
      product,
      {
        variantId: candidate.variantId,
        quantity: candidate.quantity,
        giftWrapped: candidate.giftWrapped,
      },
      settings.maxCartQuantity,
    );
    if (result.ok) {
      restored = result.value.items;
    }
  }

  return Object.freeze([...restored]);
}

function parseCategory(
  value: unknown,
  products: readonly Product[],
): CategoryFilter {
  return value === "all" ||
    (typeof value === "string" &&
      products.some((product) => product.category === value))
    ? (value as CategoryFilter)
    : "all";
}

function parseScreen(value: unknown): KioskScreen {
  return typeof value === "string" &&
    KIOSK_SCREENS.some((screen) => screen === value)
    ? (value as KioskScreen)
    : "welcome";
}

function parseCustomer(value: unknown): CustomerDetails {
  if (!isRecord(value)) {
    return EMPTY_CUSTOMER_DETAILS;
  }

  return Object.freeze({
    customerName: stringValue(value.customerName).slice(0, 80),
    customerPhone: stringValue(value.customerPhone).slice(0, 30),
    giftNote: stringValue(value.giftNote).slice(0, 240),
    orderNote: stringValue(value.orderNote).slice(0, 240),
  });
}

type PersistedSession = Readonly<{
  version: 4;
  tenantKey: string;
  lastActivityAt: number;
  screen: KioskScreen;
  searchQuery: string;
  selectedCategory: CategoryFilter;
  selectedProductId: string | null;
  cartItems: readonly CartLine[];
  customer: CustomerDetails;
  pendingSubmission: PendingOrderSubmission | null;
  currentOrder: Order | null;
  countdownSeconds: number;
  qrExtended: boolean;
}>;

export interface KioskStoreState {
  tenantKey: string;
  hasHydrated: boolean;
  storageAvailable: boolean;
  screen: KioskScreen;
  searchQuery: string;
  selectedCategory: CategoryFilter;
  selectedProductId: string | null;
  products: readonly Product[];
  cartItems: readonly CartLine[];
  customer: CustomerDetails;
  settings: PresenterSettings;
  storeOpen: boolean;
  orderHistory: readonly OrderHistoryItem[];
  pendingSubmission: PendingOrderSubmission | null;
  currentOrder: Order | null;
  countdownSeconds: number;
  qrExtended: boolean;
  isCreatingOrder: boolean;
  lastCartError: CartError | null;
  lastOrderError: OrderError | null;
  setTenant: (tenantKey: string) => void;
  hydrate: (bootstrap?: KioskBootstrap) => void;
  syncBootstrap: (bootstrap: KioskBootstrap) => void;
  setScreen: (screen: KioskScreen) => void;
  startShopping: () => void;
  openProduct: (productId: string) => void;
  closeProduct: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: CategoryFilter) => void;
  addToCart: (productId: string, options?: AddCartItemOptions) => CartResult;
  updateCartQuantity: (lineKey: string, quantity: number) => CartResult;
  setCartGiftWrapped: (lineKey: string, giftWrapped: boolean) => CartResult;
  removeFromCart: (lineKey: string) => CartResult;
  clearCart: () => void;
  clearCartError: () => void;
  updateCustomer: (details: Partial<CustomerDetails>) => void;
  updateSettings: (settings: Partial<PresenterSettings>) => SettingsResult;
  createOrder: () => OrderResult;
  completeOrderCreation: (order: Order) => void;
  failOrderCreation: (error: OrderError) => void;
  markCurrentOrderAsSent: () => void;
  clearOrderHistory: () => void;
  clearOrderError: () => void;
  tickCountdown: () => void;
  keepQrOpen: () => void;
  touchSession: () => void;
  resetSession: () => void;
  resetAllLocalData: () => void;
}

type StoreSet = (
  partial:
    | Partial<KioskStoreState>
    | ((state: KioskStoreState) => Partial<KioskStoreState>),
) => void;
type StoreGet = () => KioskStoreState;

function persistedSession(state: KioskStoreState): PersistedSession {
  return {
    version: 4,
    tenantKey: state.tenantKey,
    lastActivityAt: Date.now(),
    screen: state.screen,
    searchQuery: state.searchQuery,
    selectedCategory: state.selectedCategory,
    selectedProductId: state.selectedProductId,
    cartItems: state.cartItems,
    customer: state.customer,
    pendingSubmission: state.pendingSubmission,
    currentOrder: state.currentOrder,
    countdownSeconds: state.countdownSeconds,
    qrExtended: state.qrExtended,
  };
}

function noteStorageResult(success: boolean, set: StoreSet): void {
  if (!success && typeof window !== "undefined") {
    set({ storageAvailable: false });
  }
}

function persistSession(state: KioskStoreState, set: StoreSet): void {
  noteStorageResult(
    writeStorage(
      "session",
      kioskStorageKey(ACTIVE_SESSION_STORAGE_KEY, state.tenantKey),
      JSON.stringify(persistedSession(state)),
    ),
    set,
  );
}

function persistSettings(state: KioskStoreState, set: StoreSet): void {
  noteStorageResult(
    writeStorage(
      "local",
      kioskStorageKey(PRESENTER_SETTINGS_STORAGE_KEY, state.tenantKey),
      JSON.stringify(state.settings),
    ),
    set,
  );
}

function persistHistory(state: KioskStoreState, set: StoreSet): void {
  noteStorageResult(
    writeStorage(
      "local",
      kioskStorageKey(ORDERS_STORAGE_KEY, state.tenantKey),
      JSON.stringify(state.orderHistory.slice(0, MAX_ORDER_HISTORY)),
    ),
    set,
  );
}

function productNotFoundResult(): CartResult {
  return {
    ok: false,
    error: Object.freeze({
      code: "PRODUCT_NOT_FOUND",
      message: "That gift could not be found in the catalogue.",
    }),
  };
}

function lineNotFoundResult(): CartResult {
  return {
    ok: false,
    error: Object.freeze({
      code: "LINE_NOT_FOUND",
      message: "That cart item is no longer available.",
    }),
  };
}

function commitCartResult(
  result: CartResult,
  set: StoreSet,
  get: StoreGet,
): CartResult {
  if (!result.ok) {
    set({ lastCartError: result.error });
    return result;
  }

  set({
    cartItems: result.value.items,
    pendingSubmission: null,
    currentOrder: null,
    lastCartError: null,
    lastOrderError: null,
  });
  persistSession(get(), set);
  return result;
}

export const useKioskStore = create<KioskStoreState>((set, get) => ({
  tenantKey: "chapega",
  hasHydrated: false,
  storageAvailable: true,
  screen: "welcome",
  searchQuery: "",
  selectedCategory: "all",
  selectedProductId: null,
  products: CATALOGUE_PRODUCTS,
  cartItems: Object.freeze([]),
  customer: EMPTY_CUSTOMER_DETAILS,
  settings: DEFAULT_PRESENTER_SETTINGS,
  storeOpen: true,
  orderHistory: Object.freeze([]),
  pendingSubmission: null,
  currentOrder: null,
  countdownSeconds: DEFAULT_PRESENTER_SETTINGS.qrResetSeconds,
  qrExtended: false,
  isCreatingOrder: false,
  lastCartError: null,
  lastOrderError: null,

  setTenant: (tenantKey) => {
    const nextTenantKey = normalizedTenantKey(tenantKey);
    if (get().tenantKey === nextTenantKey) return;
    set({
      tenantKey: nextTenantKey,
      hasHydrated: false,
      storageAvailable: true,
      screen: "welcome",
      searchQuery: "",
      selectedCategory: "all",
      selectedProductId: null,
      products: CATALOGUE_PRODUCTS,
      cartItems: Object.freeze([]),
      customer: EMPTY_CUSTOMER_DETAILS,
      settings: DEFAULT_PRESENTER_SETTINGS,
      storeOpen: true,
      orderHistory: Object.freeze([]),
      pendingSubmission: null,
      currentOrder: null,
      countdownSeconds: DEFAULT_PRESENTER_SETTINGS.qrResetSeconds,
      qrExtended: false,
      isCreatingOrder: false,
      lastCartError: null,
      lastOrderError: null,
    });
  },

  hydrate: (bootstrap) => {
    const bootstrapTenantKey = bootstrap?.vendor?.slug
      ? normalizedTenantKey(bootstrap.vendor.slug)
      : get().tenantKey;
    if (bootstrapTenantKey !== get().tenantKey) {
      get().setTenant(bootstrapTenantKey);
    }
    if (get().hasHydrated || typeof window === "undefined") {
      return;
    }

    const tenantKey = get().tenantKey;
    const revisionAvailable = resetLegacyDataForCurrentCatalogue(tenantKey);
    const settingsRead = readStorage(
      "local",
      kioskStorageKey(PRESENTER_SETTINGS_STORAGE_KEY, tenantKey),
    );
    const historyRead = readStorage(
      "local",
      kioskStorageKey(ORDERS_STORAGE_KEY, tenantKey),
    );
    const sessionRead = readStorage(
      "session",
      kioskStorageKey(ACTIVE_SESSION_STORAGE_KEY, tenantKey),
    );
    const products = bootstrap
      ? Object.freeze([...bootstrap.products])
      : CATALOGUE_PRODUCTS;
    const settings = bootstrap
      ? parseSettings(bootstrap.settings)
      : parseSettings(parseJson(settingsRead.value));
    const orderHistory = parseHistory(parseJson(historyRead.value));
    const rawSession = parseJson(sessionRead.value);

    let screen: KioskScreen = "welcome";
    let searchQuery = "";
    let selectedCategory: CategoryFilter = "all";
    let selectedProductId: string | null = null;
    let cartItems: readonly CartLine[] = Object.freeze([]);
    let customer = EMPTY_CUSTOMER_DETAILS;
    let pendingSubmission: PendingOrderSubmission | null = null;
    let currentOrder: Order | null = null;
    let countdownSeconds = settings.qrResetSeconds;
    let qrExtended = false;

    const sessionAge = isRecord(rawSession) && typeof rawSession.lastActivityAt === "number"
      ? Date.now() - rawSession.lastActivityAt
      : Number.POSITIVE_INFINITY;
    const sessionIsFresh = isRecord(rawSession) &&
      rawSession.version === 4 &&
      rawSession.tenantKey === tenantKey &&
      sessionAge >= 0 &&
      sessionAge <= KIOSK_IDLE_TIMEOUT_MS;

    if (sessionIsFresh) {
      screen = parseScreen(rawSession.screen);
      searchQuery = stringValue(rawSession.searchQuery).slice(0, 120);
      selectedCategory = parseCategory(rawSession.selectedCategory, products);
      const candidateProductId = stringValue(rawSession.selectedProductId);
      selectedProductId = products.some((product) => product.id === candidateProductId)
        ? candidateProductId
        : null;
      cartItems = restoreCart(rawSession.cartItems, settings, products);
      customer = parseCustomer(rawSession.customer);
      pendingSubmission = parsePendingOrderSubmission(rawSession.pendingSubmission);
      currentOrder = parseOrder(rawSession.currentOrder);
      if (
        currentOrder &&
        LEGACY_DEFAULT_SHOP_NAMES.some((name) =>
          currentOrder?.whatsappMessage.includes(`Hello ${name},`),
        )
      ) {
        currentOrder = null;
      }
      // The one-time extension is restored with the countdown it produced, so
      // a reload can neither shorten it nor grant a second extension.
      qrExtended = rawSession.qrExtended === true;
      countdownSeconds = boundedInteger(
        rawSession.countdownSeconds,
        settings.qrResetSeconds,
        0,
        qrExtended
          ? Math.max(settings.qrResetSeconds, QR_MAX_TOTAL_SECONDS)
          : settings.qrResetSeconds,
      );
    } else if (isRecord(rawSession)) {
      removeStorage(
        "session",
        kioskStorageKey(ACTIVE_SESSION_STORAGE_KEY, tenantKey),
      );
    }

    if (screen === "product-details" && !selectedProductId) {
      screen = "catalogue";
    }
    if (screen === "qr" && !currentOrder) {
      screen = cartItems.length > 0 ? "review" : "welcome";
    }
    if (screen === "approval") {
      screen = currentOrder ? "qr" : cartItems.length > 0 ? "review" : "welcome";
    }

    set({
      hasHydrated: true,
      storageAvailable:
        revisionAvailable &&
        settingsRead.available &&
        historyRead.available &&
        sessionRead.available,
      settings,
      storeOpen: bootstrap?.storeOpen ?? true,
      products,
      orderHistory,
      screen,
      searchQuery,
      selectedCategory,
      selectedProductId,
      cartItems,
      customer,
      pendingSubmission,
      currentOrder,
      countdownSeconds,
      qrExtended,
      isCreatingOrder: false,
      lastCartError: null,
      lastOrderError: null,
    });
  },

  syncBootstrap: (bootstrap) => {
    const bootstrapTenantKey = normalizedTenantKey(bootstrap.vendor.slug);
    if (bootstrapTenantKey !== get().tenantKey) {
      get().setTenant(bootstrapTenantKey);
    }
    const products = Object.freeze([...bootstrap.products]);
    const settings = parseSettings(bootstrap.settings);
    const state = get();
    const selectedCategory = parseCategory(state.selectedCategory, products);
    const selectedProductId =
      state.selectedProductId &&
      products.some((product) => product.id === state.selectedProductId)
        ? state.selectedProductId
        : null;
    const screen =
      state.screen === "product-details" && !selectedProductId
        ? "catalogue"
        : state.screen;
    const cartItems = restoreCart(state.cartItems, settings, products);
    const cartChanged =
      JSON.stringify(cartItems) !== JSON.stringify(state.cartItems);
    const activeCheckoutScreens: readonly KioskScreen[] = [
      "cart",
      "customer",
      "checkout",
      "review",
    ];
    const reconciledScreen =
      cartChanged &&
      cartItems.length === 0 &&
      activeCheckoutScreens.includes(screen)
        ? "catalogue"
        : screen;
    set({
      products,
      settings,
      storeOpen: bootstrap.storeOpen,
      selectedCategory,
      selectedProductId,
      screen: reconciledScreen,
      cartItems,
      ...(cartChanged
        ? {
            lastCartError: Object.freeze({
              code: "PRODUCT_UNAVAILABLE" as const,
              message:
                "Your cart was updated to match the latest prices and availability.",
            }),
          }
        : {}),
      countdownSeconds:
        state.screen === "qr"
          ? Math.min(
              state.countdownSeconds,
              state.qrExtended
                ? Math.max(settings.qrResetSeconds, QR_MAX_TOTAL_SECONDS)
                : settings.qrResetSeconds,
            )
          : settings.qrResetSeconds,
    });
    persistSession(get(), set);
  },

  setScreen: (screen) => {
    set({ screen });
    persistSession(get(), set);
  },

  startShopping: () => {
    set({ screen: "catalogue", selectedProductId: null });
    persistSession(get(), set);
  },

  openProduct: (productId) => {
    if (!get().products.some((product) => product.id === productId)) {
      return;
    }
    set({ selectedProductId: productId, screen: "product-details" });
    persistSession(get(), set);
  },

  closeProduct: () => {
    set({ selectedProductId: null, screen: "catalogue" });
    persistSession(get(), set);
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery: searchQuery.slice(0, 120) });
    persistSession(get(), set);
  },

  setSelectedCategory: (selectedCategory) => {
    set({ selectedCategory });
    persistSession(get(), set);
  },

  addToCart: (productId, options = {}) => {
    const product = get().products.find((item) => item.id === productId);
    if (!product) {
      return commitCartResult(productNotFoundResult(), set, get);
    }

    const resolvedOptions: AddCartItemOptions =
      product.variants.length > 0 && !options.variantId
        ? { ...options, variantId: product.variants[0].id }
        : options;
    return commitCartResult(
      addCartItem(
        get().cartItems,
        product,
        resolvedOptions,
        get().settings.maxCartQuantity,
      ),
      set,
      get,
    );
  },

  updateCartQuantity: (lineKey, quantity) =>
    commitCartResult(
      setCartLineQuantity(
        get().cartItems,
        lineKey,
        quantity,
        get().settings.maxCartQuantity,
      ),
      set,
      get,
    ),

  setCartGiftWrapped: (lineKey, giftWrapped) => {
    const line = get().cartItems.find((item) => item.key === lineKey);
    if (!line) {
      return commitCartResult(lineNotFoundResult(), set, get);
    }

    const product = get().products.find((item) => item.id === line.productId);
    if (!product) {
      return commitCartResult(productNotFoundResult(), set, get);
    }

    return commitCartResult(
      setCartLineGiftWrapped(
        get().cartItems,
        lineKey,
        giftWrapped,
        product,
        get().settings.maxCartQuantity,
      ),
      set,
      get,
    );
  },

  removeFromCart: (lineKey) =>
    commitCartResult(
      removeCartLine(
        get().cartItems,
        lineKey,
        get().settings.maxCartQuantity,
      ),
      set,
      get,
    ),

  clearCart: () => {
    set({
      cartItems: Object.freeze([]),
      pendingSubmission: null,
      currentOrder: null,
      lastCartError: null,
      lastOrderError: null,
    });
    persistSession(get(), set);
  },

  clearCartError: () => set({ lastCartError: null }),

  updateCustomer: (details) => {
    set((state) => ({
      customer: Object.freeze({
        customerName: (details.customerName ?? state.customer.customerName).slice(
          0,
          80,
        ),
        customerPhone: (
          details.customerPhone ?? state.customer.customerPhone
        ).slice(0, 30),
        giftNote: (details.giftNote ?? state.customer.giftNote).slice(0, 240),
        orderNote: (details.orderNote ?? state.customer.orderNote).slice(0, 240),
      }),
      pendingSubmission: null,
      currentOrder: null,
      lastOrderError: null,
    }));
    persistSession(get(), set);
  },

  updateSettings: (patch) => {
    const current = get();
    const merged = { ...current.settings, ...patch };
    const countryCode = merged.defaultCountryCode
      .replace(/\D/g, "")
      .replace(/^0+/, "");
    if (countryCode.length < 1 || countryCode.length > 3) {
      return {
        ok: false,
        error: Object.freeze({
          code: "INVALID_SETTINGS",
          message: "Enter a valid one-to-three digit country code.",
        }),
      };
    }

    if (!merged.shopName.trim() || !merged.kioskName.trim()) {
      return {
        ok: false,
        error: Object.freeze({
          code: "INVALID_SETTINGS",
          message: "Shop name and kiosk name are required.",
        }),
      };
    }

    if (
      !Number.isSafeInteger(merged.maxCartQuantity) ||
      merged.maxCartQuantity < 1 ||
      merged.maxCartQuantity > 5 ||
      merged.maxCartQuantity < getCartUnitCount(current.cartItems)
    ) {
      return {
        ok: false,
        error: Object.freeze({
          code: "INVALID_SETTINGS",
          message:
            "The maximum cart quantity must be between 1 and 5 and cannot be below the current cart count.",
        }),
      };
    }

    if (
      !Number.isSafeInteger(merged.giftWrapFeePaise) ||
      merged.giftWrapFeePaise < 0 ||
      merged.giftWrapFeePaise > 100_000 ||
      !Number.isSafeInteger(merged.qrResetSeconds) ||
      merged.qrResetSeconds < 15 ||
      merged.qrResetSeconds > 3_600
    ) {
      return {
        ok: false,
        error: Object.freeze({
          code: "INVALID_SETTINGS",
          message: "Enter valid gift-wrap and QR timeout values.",
        }),
      };
    }

    let ownerWhatsAppNumber = "";
    if (merged.ownerWhatsAppNumber.trim()) {
      try {
        ownerWhatsAppNumber = normalizeWhatsAppNumber(
          merged.ownerWhatsAppNumber,
          countryCode,
        );
      } catch (caught) {
        return {
          ok: false,
          error: Object.freeze({
            code: "INVALID_OWNER_NUMBER",
            message:
              caught instanceof WhatsAppNumberError
                ? caught.message
                : "Enter a valid owner WhatsApp number.",
          }),
        };
      }
    }

    const settings: PresenterSettings = Object.freeze({
      shopName: merged.shopName.trim().slice(0, 80),
      ownerWhatsAppNumber,
      defaultCountryCode: countryCode,
      kioskName: merged.kioskName.trim().slice(0, 80),
      maxCartQuantity: merged.maxCartQuantity,
      giftWrapFeePaise: merged.giftWrapFeePaise,
      qrResetSeconds: merged.qrResetSeconds,
      showPreviewLabel: merged.showPreviewLabel,
    });
    set({ settings, pendingSubmission: null });
    persistSettings(get(), set);
    persistSession(get(), set);
    return { ok: true, value: settings };
  },

  createOrder: () => {
    const state = get();
    if (state.currentOrder) {
      return { ok: true, value: state.currentOrder };
    }
    if (state.pendingSubmission) {
      set({ isCreatingOrder: true, lastOrderError: null });
      return { ok: true, value: state.pendingSubmission.order };
    }
    if (state.isCreatingOrder) {
      const duplicateError: OrderError = Object.freeze({
        code: "INVALID_CART",
        message: "The order is already being prepared.",
      });
      return { ok: false, error: duplicateError };
    }

    set({ isCreatingOrder: true, lastOrderError: null });
    const result = createOrder({
      cartItems: state.cartItems,
      products: state.products,
      customer: state.customer,
      settings: state.settings,
    });
    if (!result.ok) {
      set({ isCreatingOrder: false, lastOrderError: result.error });
      return result;
    }

    set({
      pendingSubmission: Object.freeze({
        idempotencyKey: createIdempotencyKey(),
        order: result.value,
        customer: state.customer,
        items: Object.freeze(
          state.cartItems.map((item) =>
            Object.freeze({
              productId: item.productId,
              ...(item.variantId ? { variantId: item.variantId } : {}),
              quantity: item.quantity,
              giftWrapped: item.giftWrapped,
            }),
          ),
        ),
      }),
    });
    persistSession(get(), set);
    return result;
  },

  completeOrderCreation: (order) => {
    const state = get();
    const historyItem = redactOrderForHistory(order);
    const orderHistory = Object.freeze([
      historyItem,
      ...state.orderHistory.filter(
        (item) => item.orderNumber !== historyItem.orderNumber,
      ),
    ].slice(0, MAX_ORDER_HISTORY));
    set({
      pendingSubmission: null,
      currentOrder: order,
      orderHistory,
      screen: "qr",
      countdownSeconds: state.settings.qrResetSeconds,
      qrExtended: false,
      isCreatingOrder: false,
      lastOrderError: null,
    });
    persistHistory(get(), set);
    persistSession(get(), set);
  },

  failOrderCreation: (error) => {
    set({
      isCreatingOrder: false,
      lastOrderError: error,
    });
    persistSession(get(), set);
  },

  markCurrentOrderAsSent: () => {
    const currentOrder = get().currentOrder;
    if (!currentOrder) {
      return;
    }

    const markedOrder = markOrderAsPresenterSent(currentOrder);
    const orderHistory = Object.freeze(
      get().orderHistory.map((item) =>
        item.orderNumber === markedOrder.orderNumber
          ? Object.freeze({ ...item, status: markedOrder.status })
          : item,
      ),
    );
    set({ currentOrder: markedOrder, orderHistory });
    persistHistory(get(), set);
    persistSession(get(), set);
  },

  clearOrderHistory: () => {
    set({ orderHistory: Object.freeze([]) });
    noteStorageResult(
      removeStorage(
        "local",
        kioskStorageKey(ORDERS_STORAGE_KEY, get().tenantKey),
      ),
      set,
    );
  },

  clearOrderError: () => set({ lastOrderError: null }),

  tickCountdown: () => {
    const state = get();
    if (state.screen !== "qr" || !state.currentOrder) {
      return;
    }

    if (state.countdownSeconds <= 1) {
      state.resetSession();
      return;
    }

    set({ countdownSeconds: state.countdownSeconds - 1 });
    persistSession(get(), set);
  },

  // "Keep this screen open" adds one extra reset period, once, capped so the
  // customer's details are never on screen for more than ~5 minutes in total.
  // The countdown keeps running and ends the session as usual.
  keepQrOpen: () => {
    const state = get();
    if (state.screen !== "qr" || !state.currentOrder || state.qrExtended) {
      return;
    }
    const extended = Math.min(
      state.countdownSeconds + state.settings.qrResetSeconds,
      QR_MAX_TOTAL_SECONDS,
    );
    set({
      qrExtended: true,
      countdownSeconds: Math.max(state.countdownSeconds, extended),
    });
    persistSession(get(), set);
  },

  touchSession: () => {
    if (get().screen !== "welcome") persistSession(get(), set);
  },

  resetSession: () => {
    set({
      screen: "welcome",
      searchQuery: "",
      selectedCategory: "all",
      selectedProductId: null,
      cartItems: Object.freeze([]),
      customer: EMPTY_CUSTOMER_DETAILS,
      pendingSubmission: null,
      currentOrder: null,
      countdownSeconds: get().settings.qrResetSeconds,
      qrExtended: false,
      isCreatingOrder: false,
      lastCartError: null,
      lastOrderError: null,
    });
    noteStorageResult(
      removeStorage(
        "session",
        kioskStorageKey(ACTIVE_SESSION_STORAGE_KEY, get().tenantKey),
      ),
      set,
    );
  },

  resetAllLocalData: () => {
    set({
      screen: "welcome",
      searchQuery: "",
      selectedCategory: "all",
      selectedProductId: null,
      cartItems: Object.freeze([]),
      customer: EMPTY_CUSTOMER_DETAILS,
      settings: DEFAULT_PRESENTER_SETTINGS,
      storeOpen: true,
      orderHistory: Object.freeze([]),
      pendingSubmission: null,
      currentOrder: null,
      countdownSeconds: DEFAULT_PRESENTER_SETTINGS.qrResetSeconds,
      qrExtended: false,
      isCreatingOrder: false,
      lastCartError: null,
      lastOrderError: null,
    });
    const settingsRemoved = removeStorage(
      "local",
      kioskStorageKey(PRESENTER_SETTINGS_STORAGE_KEY, get().tenantKey),
    );
    const historyRemoved = removeStorage(
      "local",
      kioskStorageKey(ORDERS_STORAGE_KEY, get().tenantKey),
    );
    const sessionRemoved = removeStorage(
      "session",
      kioskStorageKey(ACTIVE_SESSION_STORAGE_KEY, get().tenantKey),
    );
    noteStorageResult(
      settingsRemoved && historyRemoved && sessionRemoved,
      set,
    );
  },
}));

export const selectCartUnitCount = (state: KioskStoreState): number =>
  getCartUnitCount(state.cartItems);

export const selectRemainingCartCapacity = (
  state: KioskStoreState,
): number =>
  getRemainingCartCapacity(state.cartItems, state.settings.maxCartQuantity);

export const selectCartTotals = (state: KioskStoreState): CartTotals =>
  calculateCartTotals(state.cartItems, state.settings.giftWrapFeePaise);

export const selectSelectedProduct = (
  state: KioskStoreState,
): Product | undefined =>
  state.selectedProductId
    ? state.products.find((product) => product.id === state.selectedProductId)
    : undefined;

export const selectVisibleProducts = (
  state: KioskStoreState,
): readonly Product[] => {
  const query = state.searchQuery.trim().toLocaleLowerCase("en-IN");

  return state.products.filter((product) => {
    if (
      state.selectedCategory !== "all" &&
      product.category !== state.selectedCategory
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      product.name,
      product.category,
      product.shortDescription,
      ...product.tags,
      ...product.recipientTags,
      ...product.occasionTags,
    ]
      .join(" ")
      .toLocaleLowerCase("en-IN")
      .includes(query);
  });
};

export const selectOwnerNumberIsConfigured = (
  state: KioskStoreState,
): boolean => Boolean(state.settings.ownerWhatsAppNumber);
