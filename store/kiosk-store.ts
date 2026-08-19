"use client";

import { create } from "zustand";

import {
  CATALOGUE_CATEGORIES,
  CATALOGUE_PRODUCTS,
  getProductById,
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
  "presenter",
  "approval",
];

type StorageKind = "local" | "session";

const memoryStorage: Record<StorageKind, Map<string, string>> = {
  local: new Map<string, string>(),
  session: new Map<string, string>(),
};

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

function resetLegacyDataForCurrentCatalogue(): boolean {
  const revisionRead = readStorage("local", CATALOGUE_REVISION_STORAGE_KEY);
  if (revisionRead.value === CURRENT_CATALOGUE_REVISION) {
    return revisionRead.available;
  }

  const results = [
    removeStorage("local", ORDERS_STORAGE_KEY),
    removeStorage("local", "gift-kiosk-demo-orders"),
    removeStorage("local", "gift-kiosk-setup-dismissed"),
    removeStorage("local", "gift-kiosk-setup-dismissed-v2"),
    removeStorage("session", ACTIVE_SESSION_STORAGE_KEY),
    writeStorage(
      "local",
      CATALOGUE_REVISION_STORAGE_KEY,
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
    typeof value.orderNumber !== "string" ||
    value.id !== value.orderNumber ||
    !/^GFT(?:-DEMO)?-\d{8}-\d{4}$/.test(value.orderNumber) ||
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

function restoreCart(
  value: unknown,
  settings: PresenterSettings,
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

    const product = getProductById(candidate.productId);
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

function parseCategory(value: unknown): CategoryFilter {
  return value === "all" ||
    (typeof value === "string" &&
      CATALOGUE_CATEGORIES.some((category) => category === value))
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
  version: 1;
  screen: KioskScreen;
  searchQuery: string;
  selectedCategory: CategoryFilter;
  selectedProductId: string | null;
  cartItems: readonly CartLine[];
  customer: CustomerDetails;
  currentOrder: Order | null;
  countdownSeconds: number;
}>;

export interface KioskStoreState {
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
  orderHistory: readonly OrderHistoryItem[];
  currentOrder: Order | null;
  countdownSeconds: number;
  isCountdownPaused: boolean;
  isCreatingOrder: boolean;
  lastCartError: CartError | null;
  lastOrderError: OrderError | null;
  hydrate: () => void;
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
  markCurrentOrderAsSent: () => void;
  clearOrderHistory: () => void;
  clearOrderError: () => void;
  tickCountdown: () => void;
  pauseCountdown: () => void;
  resumeCountdown: () => void;
  resetCountdown: () => void;
  keepQrOpen: () => void;
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
    version: 1,
    screen: state.screen,
    searchQuery: state.searchQuery,
    selectedCategory: state.selectedCategory,
    selectedProductId: state.selectedProductId,
    cartItems: state.cartItems,
    customer: state.customer,
    currentOrder: state.currentOrder,
    countdownSeconds: state.countdownSeconds,
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
      ACTIVE_SESSION_STORAGE_KEY,
      JSON.stringify(persistedSession(state)),
    ),
    set,
  );
}

function persistSettings(state: KioskStoreState, set: StoreSet): void {
  noteStorageResult(
    writeStorage(
      "local",
      PRESENTER_SETTINGS_STORAGE_KEY,
      JSON.stringify(state.settings),
    ),
    set,
  );
}

function persistHistory(state: KioskStoreState, set: StoreSet): void {
  noteStorageResult(
    writeStorage(
      "local",
      ORDERS_STORAGE_KEY,
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
    currentOrder: null,
    lastCartError: null,
    lastOrderError: null,
  });
  persistSession(get(), set);
  return result;
}

export const useKioskStore = create<KioskStoreState>((set, get) => ({
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
  orderHistory: Object.freeze([]),
  currentOrder: null,
  countdownSeconds: DEFAULT_PRESENTER_SETTINGS.qrResetSeconds,
  isCountdownPaused: false,
  isCreatingOrder: false,
  lastCartError: null,
  lastOrderError: null,

  hydrate: () => {
    if (get().hasHydrated || typeof window === "undefined") {
      return;
    }

    const revisionAvailable = resetLegacyDataForCurrentCatalogue();
    const settingsRead = readStorage(
      "local",
      PRESENTER_SETTINGS_STORAGE_KEY,
    );
    const historyRead = readStorage("local", ORDERS_STORAGE_KEY);
    const sessionRead = readStorage("session", ACTIVE_SESSION_STORAGE_KEY);
    const settings = parseSettings(parseJson(settingsRead.value));
    const orderHistory = parseHistory(parseJson(historyRead.value));
    const rawSession = parseJson(sessionRead.value);

    let screen: KioskScreen = "welcome";
    let searchQuery = "";
    let selectedCategory: CategoryFilter = "all";
    let selectedProductId: string | null = null;
    let cartItems: readonly CartLine[] = Object.freeze([]);
    let customer = EMPTY_CUSTOMER_DETAILS;
    let currentOrder: Order | null = null;
    let countdownSeconds = settings.qrResetSeconds;
    let isCountdownPaused = false;

    if (isRecord(rawSession)) {
      screen = parseScreen(rawSession.screen);
      searchQuery = stringValue(rawSession.searchQuery).slice(0, 120);
      selectedCategory = parseCategory(rawSession.selectedCategory);
      const candidateProductId = stringValue(rawSession.selectedProductId);
      selectedProductId = getProductById(candidateProductId)
        ? candidateProductId
        : null;
      cartItems = restoreCart(rawSession.cartItems, settings);
      customer = parseCustomer(rawSession.customer);
      currentOrder = parseOrder(rawSession.currentOrder);
      if (
        currentOrder &&
        LEGACY_DEFAULT_SHOP_NAMES.some((name) =>
          currentOrder?.whatsappMessage.includes(`Hello ${name},`),
        )
      ) {
        currentOrder = null;
      }
      countdownSeconds = boundedInteger(
        rawSession.countdownSeconds,
        settings.qrResetSeconds,
        0,
        settings.qrResetSeconds,
      );
      // A pause is intentionally not restored. Reloading resumes the privacy
      // countdown so customer details cannot remain on a public kiosk forever.
      isCountdownPaused = false;
    }

    if (screen === "product-details" && !selectedProductId) {
      screen = "catalogue";
    }
    if (screen === "qr" && !currentOrder) {
      screen = cartItems.length > 0 ? "review" : "welcome";
    }

    set({
      hasHydrated: true,
      storageAvailable:
        revisionAvailable &&
        settingsRead.available &&
        historyRead.available &&
        sessionRead.available,
      settings,
      orderHistory,
      screen,
      searchQuery,
      selectedCategory,
      selectedProductId,
      cartItems,
      customer,
      currentOrder,
      countdownSeconds,
      isCountdownPaused,
      isCreatingOrder: false,
      lastCartError: null,
      lastOrderError: null,
    });
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
    if (!getProductById(productId)) {
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
    const product = getProductById(productId);
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

    const product = getProductById(line.productId);
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
    set({ settings });
    persistSettings(get(), set);
    persistSession(get(), set);
    return { ok: true, value: settings };
  },

  createOrder: () => {
    const state = get();
    if (state.currentOrder) {
      return { ok: true, value: state.currentOrder };
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

    const historyItem = redactOrderForHistory(result.value);
    const orderHistory = Object.freeze([
      historyItem,
      ...state.orderHistory.filter(
        (item) => item.orderNumber !== historyItem.orderNumber,
      ),
    ].slice(0, MAX_ORDER_HISTORY));
    set({
      currentOrder: result.value,
      orderHistory,
      screen: "qr",
      countdownSeconds: state.settings.qrResetSeconds,
      isCountdownPaused: false,
      isCreatingOrder: false,
      lastOrderError: null,
    });
    persistHistory(get(), set);
    persistSession(get(), set);
    return result;
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
      removeStorage("local", ORDERS_STORAGE_KEY),
      set,
    );
  },

  clearOrderError: () => set({ lastOrderError: null }),

  tickCountdown: () => {
    const state = get();
    if (
      state.screen !== "qr" ||
      !state.currentOrder ||
      state.isCountdownPaused
    ) {
      return;
    }

    if (state.countdownSeconds <= 1) {
      state.resetSession();
      return;
    }

    set({ countdownSeconds: state.countdownSeconds - 1 });
    persistSession(get(), set);
  },

  pauseCountdown: () => {
    set({ isCountdownPaused: true });
    persistSession(get(), set);
  },

  resumeCountdown: () => {
    set({ isCountdownPaused: false });
    persistSession(get(), set);
  },

  resetCountdown: () => {
    set({ countdownSeconds: get().settings.qrResetSeconds });
    persistSession(get(), set);
  },

  keepQrOpen: () => {
    set({ isCountdownPaused: true });
    persistSession(get(), set);
  },

  resetSession: () => {
    set({
      screen: "welcome",
      searchQuery: "",
      selectedCategory: "all",
      selectedProductId: null,
      cartItems: Object.freeze([]),
      customer: EMPTY_CUSTOMER_DETAILS,
      currentOrder: null,
      countdownSeconds: get().settings.qrResetSeconds,
      isCountdownPaused: false,
      isCreatingOrder: false,
      lastCartError: null,
      lastOrderError: null,
    });
    noteStorageResult(
      removeStorage("session", ACTIVE_SESSION_STORAGE_KEY),
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
      orderHistory: Object.freeze([]),
      currentOrder: null,
      countdownSeconds: DEFAULT_PRESENTER_SETTINGS.qrResetSeconds,
      isCountdownPaused: false,
      isCreatingOrder: false,
      lastCartError: null,
      lastOrderError: null,
    });
    const settingsRemoved = removeStorage(
      "local",
      PRESENTER_SETTINGS_STORAGE_KEY,
    );
    const historyRemoved = removeStorage("local", ORDERS_STORAGE_KEY);
    const sessionRemoved = removeStorage(
      "session",
      ACTIVE_SESSION_STORAGE_KEY,
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
