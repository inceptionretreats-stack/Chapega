// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CATALOGUE_PRODUCTS } from "@/data/catalogue";
import { useKioskStore } from "@/store/kiosk-store";

// The store is a module singleton. Snapshot its pristine state at import time
// so every test starts from (and leaves behind) the exact initial state, no
// matter which order the tests run in.
const INITIAL_STATE = useKioskStore.getState();

function resetKioskEnvironment() {
  useKioskStore.setState(INITIAL_STATE, true);
  window.localStorage.clear();
  window.sessionStorage.clear();
}

describe("kiosk order retries", () => {
  beforeEach(resetKioskEnvironment);
  afterEach(resetKioskEnvironment);

  it("reuses the same idempotency key after an uncertain request failure", () => {
    const store = useKioskStore.getState();
    const settings = store.updateSettings({
      ownerWhatsAppNumber: "919876543210",
    });
    expect(settings.ok).toBe(true);

    const product = CATALOGUE_PRODUCTS[0];
    expect(product).toBeDefined();
    expect(store.addToCart(product!.id).ok).toBe(true);

    const firstAttempt = useKioskStore.getState().createOrder();
    expect(firstAttempt.ok).toBe(true);
    if (!firstAttempt.ok) return;

    useKioskStore.getState().failOrderCreation({
      code: "INVALID_CART",
      message: "The response could not be confirmed.",
    });
    const retry = useKioskStore.getState().createOrder();
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.value.id).toBe(firstAttempt.value.id);
    expect(retry.value.orderNumber).toBe(firstAttempt.value.orderNumber);

    useKioskStore.getState().failOrderCreation({
      code: "INVALID_CART",
      message: "The response could not be confirmed.",
    });
    useKioskStore.getState().updateCustomer({ customerName: "New customer" });
    const changedOrder = useKioskStore.getState().createOrder();
    expect(changedOrder.ok).toBe(true);
    if (!changedOrder.ok) return;
    expect(changedOrder.value.id).not.toBe(firstAttempt.value.id);
  });

  it("keeps the exact pending request when a live catalogue sync changes the cart", () => {
    const store = useKioskStore.getState();
    expect(
      store.updateSettings({ ownerWhatsAppNumber: "919876543210" }).ok,
    ).toBe(true);
    const product = CATALOGUE_PRODUCTS[0];
    expect(store.addToCart(product.id).ok).toBe(true);
    store.setScreen("review");

    const firstAttempt = useKioskStore.getState().createOrder();
    expect(firstAttempt.ok).toBe(true);
    if (!firstAttempt.ok) return;
    useKioskStore.getState().failOrderCreation({
      code: "INVALID_CART",
      message: "The response could not be confirmed.",
    });

    const stateBeforeSync = useKioskStore.getState();
    const originalSubmission = stateBeforeSync.pendingSubmission;
    expect(originalSubmission?.items).toEqual([
      {
        productId: product.id,
        quantity: 1,
        giftWrapped: false,
      },
    ]);

    stateBeforeSync.syncBootstrap({
      vendor: {
        id: "00000000-0000-4000-8000-000000000001",
        slug: "chapega",
        displayName: "Chapega.com",
      },
      revision: "catalogue-changed",
      products: stateBeforeSync.products.map((candidate) =>
        candidate.id === product.id
          ? { ...candidate, availability: "unavailable", stock: 0 }
          : candidate,
      ),
      settings: stateBeforeSync.settings,
      storeOpen: true,
      syncedAt: new Date().toISOString(),
    });

    const stateAfterSync = useKioskStore.getState();
    expect(stateAfterSync.cartItems).toEqual([]);
    expect(stateAfterSync.screen).toBe("catalogue");
    expect(stateAfterSync.pendingSubmission).toEqual(originalSubmission);
    const retry = stateAfterSync.createOrder();
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.value.id).toBe(firstAttempt.value.id);
  });

  it("keeps each vendor cart and customer session in a separate browser namespace", () => {
    const bootstrap = (slug: string, id: string) => ({
      vendor: { id, slug, displayName: slug === "chapega" ? "Chapega.com" : "Second Store" },
      revision: `revision-${slug}`,
      products: CATALOGUE_PRODUCTS,
      settings: useKioskStore.getState().settings,
      storeOpen: true,
      syncedAt: new Date().toISOString(),
    });

    useKioskStore.getState().setTenant("reset-scope");
    useKioskStore.getState().setTenant("chapega");
    useKioskStore.getState().hydrate(
      bootstrap("chapega", "00000000-0000-4000-8000-000000000001"),
    );
    expect(useKioskStore.getState().addToCart(CATALOGUE_PRODUCTS[0].id).ok).toBe(true);
    useKioskStore.getState().updateCustomer({ customerName: "Chapega customer" });
    expect(useKioskStore.getState().cartItems).toHaveLength(1);

    useKioskStore.getState().setTenant("second-store");
    useKioskStore.getState().hydrate(
      bootstrap("second-store", "00000000-0000-4000-8000-000000000002"),
    );
    expect(useKioskStore.getState().cartItems).toEqual([]);
    expect(useKioskStore.getState().customer.customerName).toBe("");
    expect(useKioskStore.getState().addToCart(CATALOGUE_PRODUCTS[1].id).ok).toBe(true);

    useKioskStore.getState().setTenant("chapega");
    useKioskStore.getState().hydrate(
      bootstrap("chapega", "00000000-0000-4000-8000-000000000001"),
    );
    expect(useKioskStore.getState().cartItems).toHaveLength(1);
    expect(useKioskStore.getState().cartItems[0].productId).toBe(CATALOGUE_PRODUCTS[0].id);
    expect(useKioskStore.getState().customer.customerName).toBe("Chapega customer");
  });
});
