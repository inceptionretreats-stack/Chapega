// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CATALOGUE_PRODUCTS } from "@/data/catalogue";
import { buildWhatsAppMessage, buildWhatsAppUrl } from "@/domain/whatsapp";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  CATALOGUE_REVISION_STORAGE_KEY,
  CURRENT_CATALOGUE_REVISION,
  DEFAULT_PRESENTER_SETTINGS,
  kioskStorageKey,
  useKioskStore,
} from "@/store/kiosk-store";

const SERVER_ORDER_ID = "6f1c3a52-8d3e-4b7a-9c1e-0a5b2d4e7f90";
const SERVER_ORDER_NUMBER = "GFT-20261008-123456";

function serverOrder(overrides: Record<string, unknown> = {}) {
  const product = CATALOGUE_PRODUCTS[0];
  const items = [
    {
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPricePaise: product.pricePaise,
      giftWrapped: false,
      lineTotalPaise: product.pricePaise,
    },
  ];
  const whatsappMessage = buildWhatsAppMessage({
    shopName: "Chapega.com",
    orderNumber: SERVER_ORDER_NUMBER,
    kioskName: "Main Entrance",
    items,
    giftWrapPaise: 0,
    totalPaise: product.pricePaise,
  });
  return {
    id: SERVER_ORDER_ID,
    orderNumber: SERVER_ORDER_NUMBER,
    createdAt: new Date().toISOString(),
    kioskName: "Main Entrance",
    paymentMethod: "pay_later",
    items,
    subtotalPaise: product.pricePaise,
    giftWrapPaise: 0,
    totalPaise: product.pricePaise,
    whatsappMessage,
    whatsappUrl: buildWhatsAppUrl({
      rawNumber: "919876543210",
      message: whatsappMessage,
    }),
    status: "prepared_for_whatsapp",
    ...overrides,
  };
}

function markRevisionCurrent() {
  window.localStorage.setItem(
    kioskStorageKey(CATALOGUE_REVISION_STORAGE_KEY, "chapega"),
    CURRENT_CATALOGUE_REVISION,
  );
}

function seedSession(session: Record<string, unknown>) {
  markRevisionCurrent();
  window.sessionStorage.setItem(
    kioskStorageKey(ACTIVE_SESSION_STORAGE_KEY, "chapega"),
    JSON.stringify({
      version: 4,
      tenantKey: "chapega",
      lastActivityAt: Date.now(),
      screen: "qr",
      searchQuery: "",
      selectedCategory: "all",
      selectedProductId: null,
      cartItems: [],
      customer: {},
      pendingSubmission: null,
      currentOrder: null,
      countdownSeconds: 60,
      ...session,
    }),
  );
}

function rehydrate() {
  useKioskStore.setState({ hasHydrated: false });
  useKioskStore.getState().hydrate();
  return useKioskStore.getState();
}

describe("restoring a server-issued order after a reload (AUD-10)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    useKioskStore.getState().resetSession();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps the QR screen and the same order when the id is a UUID", () => {
    seedSession({ currentOrder: serverOrder() });
    const state = rehydrate();
    expect(state.screen).toBe("qr");
    expect(state.currentOrder?.id).toBe(SERVER_ORDER_ID);
    expect(state.currentOrder?.orderNumber).toBe(SERVER_ORDER_NUMBER);
  });

  it("accepts four-digit and six-digit order number suffixes", () => {
    for (const suffix of ["1234", "123456"]) {
      const number = `GFT-20261008-${suffix}`;
      const base = serverOrder();
      const message = (base.whatsappMessage as string).replace(SERVER_ORDER_NUMBER, number);
      seedSession({
        currentOrder: {
          ...base,
          orderNumber: number,
          whatsappMessage: message,
          whatsappUrl: buildWhatsAppUrl({
            rawNumber: "919876543210",
            message,
          }),
        },
      });
      expect(rehydrate().currentOrder?.orderNumber).toBe(number);
    }
  });

  it("still rejects malformed ids and order numbers", () => {
    seedSession({ currentOrder: serverOrder({ id: "" }) });
    expect(rehydrate().currentOrder).toBeNull();
    seedSession({ currentOrder: serverOrder({ id: "x".repeat(201) }) });
    expect(rehydrate().currentOrder).toBeNull();
    seedSession({ currentOrder: serverOrder({ orderNumber: "ORDER-1" }) });
    expect(rehydrate().currentOrder).toBeNull();
  });
});

describe("order submission idempotency key (AUD-37)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useKioskStore.getState().resetSession();
    useKioskStore.setState({
      settings: {
        ...DEFAULT_PRESENTER_SETTINGS,
        ownerWhatsAppNumber: "919876543210",
      },
    });
  });
  afterEach(() => {
    useKioskStore.getState().resetSession();
  });

  it("mints a random UUID, keeps it across retries and replaces it when the order changes", () => {
    const store = useKioskStore.getState();
    expect(store.addToCart(CATALOGUE_PRODUCTS[0].id).ok).toBe(true);
    expect(useKioskStore.getState().createOrder().ok).toBe(true);
    const first = useKioskStore.getState().pendingSubmission;
    expect(first?.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first?.idempotencyKey).not.toBe(first?.order.id);

    useKioskStore.getState().failOrderCreation({
      code: "INVALID_CART",
      message: "timeout",
    });
    expect(useKioskStore.getState().createOrder().ok).toBe(true);
    expect(useKioskStore.getState().pendingSubmission?.idempotencyKey).toBe(first?.idempotencyKey);

    useKioskStore.getState().failOrderCreation({
      code: "INVALID_CART",
      message: "timeout",
    });
    useKioskStore.getState().updateCustomer({ customerName: "Asha" });
    expect(useKioskStore.getState().createOrder().ok).toBe(true);
    expect(useKioskStore.getState().pendingSubmission?.idempotencyKey).not.toBe(
      first?.idempotencyKey,
    );
  });

  it("restores the pending key after a reload so the retry cannot create a second order", () => {
    expect(useKioskStore.getState().addToCart(CATALOGUE_PRODUCTS[0].id).ok).toBe(true);
    useKioskStore.getState().setScreen("review");
    expect(useKioskStore.getState().createOrder().ok).toBe(true);
    const key = useKioskStore.getState().pendingSubmission?.idempotencyKey;
    markRevisionCurrent();
    const reloaded = rehydrate();
    expect(reloaded.pendingSubmission?.idempotencyKey).toBe(key);
  });
});
