"use client";

import { AlertCircle, CheckCircle2, Gift, ShoppingBag } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KioskBootstrap, KioskScreen, Order, Product } from "@/types/kiosk";
import type { VendorOrder } from "@/types/vendor";
import {
  selectCartTotals,
  selectCartUnitCount,
  selectRemainingCartCapacity,
  selectSelectedProduct,
  selectVisibleProducts,
  KIOSK_IDLE_TIMEOUT_MS,
  KIOSK_IDLE_WARNING_MS,
  useKioskStore,
} from "@/store/kiosk-store";
import { ShopUnavailable, type ShopUnavailableKind } from "./shop-unavailable";
import { KioskHeader } from "./kiosk-header";
import { QrErrorBoundary } from "./qr-error-boundary";
import { WelcomeScreen } from "./welcome-screen";

function ScreenLoading() {
  return <div className="loading-screen"><div className="loading-mark"><Gift size={40} /><span>Loading…</span></div></div>;
}

// Screens after the welcome screen are split out so the first page only ships
// the code it needs (keeps the hero LCP off a long hydration task).
const CartScreen = dynamic(() => import("./cart-screen").then((m) => m.CartScreen), { loading: ScreenLoading });
const CatalogueScreen = dynamic(() => import("./catalogue-screen").then((m) => m.CatalogueScreen), { loading: ScreenLoading });
const CheckoutScreen = dynamic(() => import("./checkout-screen").then((m) => m.CheckoutScreen), { loading: ScreenLoading });
const ReviewScreen = dynamic(() => import("./review-screen").then((m) => m.ReviewScreen), { loading: ScreenLoading });
const ProductDetailModal = dynamic(() => import("./product-detail-modal").then((m) => m.ProductDetailModal));
const IdleSessionDialog = dynamic(() => import("./idle-session-dialog").then((m) => m.IdleSessionDialog));

const OrderReadyScreen = dynamic(
  () => import("./order-ready-screen").then((module) => module.OrderReadyScreen),
  { loading: () => <div className="loading-screen"><div className="loading-mark"><Gift size={40} /><span>Preparing your QR…</span></div></div>, ssr: false },
);

type ToastState = {
  message: string;
  tone: "success" | "error";
  screen: KioskScreen;
} | null;

function kioskOrderFromVendor(order: VendorOrder): Order {
  return Object.freeze({
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    ...(order.customer.customerName
      ? { customerName: order.customer.customerName }
      : {}),
    ...(order.customer.customerPhone
      ? { customerPhone: order.customer.customerPhone }
      : {}),
    ...(order.customer.giftNote ? { giftNote: order.customer.giftNote } : {}),
    ...(order.customer.orderNote
      ? { orderNote: order.customer.orderNote }
      : {}),
    kioskName: order.kioskName,
    paymentMethod: order.paymentMethod,
    items: Object.freeze(
      order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        ...(item.variant ? { variant: item.variant } : {}),
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
        giftWrapped: item.giftWrapped,
        lineTotalPaise: item.lineTotalPaise,
      })),
    ),
    subtotalPaise: order.subtotalPaise,
    giftWrapPaise: order.giftWrapPaise,
    totalPaise: order.totalPaise,
    whatsappMessage: order.whatsappMessage,
    whatsappUrl: order.whatsappUrl,
    status: "prepared_for_whatsapp",
  });
}

type KioskAppProps = Readonly<{
  vendorSlug?: string;
  /** Server-fetched bootstrap: lets the welcome screen render in the first HTML. */
  initialBootstrap?: KioskBootstrap | null;
}>;

export function KioskApp({ vendorSlug, initialBootstrap = null }: KioskAppProps) {
  const router = useRouter();
  const store = useKioskStore();
  const normalizedVendorSlug = (vendorSlug ?? "chapega")
    .trim()
    .toLocaleLowerCase("en-IN");
  const kioskApiBase = vendorSlug
    ? `/api/kiosk/${encodeURIComponent(normalizedVendorSlug)}`
    : "/api/kiosk";
  const [browserOnline, setBrowserOnline] = useState(true);
  const [backendStatus, setBackendStatus] = useState<
    "checking" | "live" | "unavailable"
  >(initialBootstrap ? "live" : "checking");
  const [shopState, setShopState] = useState<ShopUnavailableKind | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [idleWarningSeconds, setIdleWarningSeconds] = useState<number | null>(null);
  const previousScreen = useRef<KioskScreen>(store.screen);
  const lastActivityAt = useRef(0);

  const unitCount = selectCartUnitCount(store);
  const remainingCapacity = selectRemainingCartCapacity(store);
  const totals = selectCartTotals(store);
  const selectedProduct = selectSelectedProduct(store);
  const visibleProducts = selectVisibleProducts(store);
  const catalogueCategories = useMemo(
    () => Array.from(new Set(store.products.map((product) => product.category))).sort(),
    [store.products],
  );
  const online = browserOnline && backendStatus === "live";

  useEffect(() => {
    useKioskStore.getState().setTenant(normalizedVendorSlug);
    // The server already resolved this shop: hydrate straight away instead of
    // waiting for a round trip.
    if (initialBootstrap && !useKioskStore.getState().hasHydrated) {
      useKioskStore.getState().hydrate(initialBootstrap);
    }
    let active = true;
    let requestVersion = 0;
    let currentController: AbortController | null = null;
    const loadBootstrap = async () => {
      const version = requestVersion + 1;
      requestVersion = version;
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 4_000);
      try {
        const response = await fetch(`${kioskApiBase}/bootstrap`, {
          // Revalidate every time: an unchanged catalogue comes back as a
          // body-less 304 against its ETag instead of the full payload.
          cache: "no-cache",
          signal: controller.signal,
        });
        if (response.status === 404 || response.status === 403) {
          // The shop does not exist or is suspended: never show a catalogue.
          if (!active || version !== requestVersion) return;
          setShopState(response.status === 404 ? "not-found" : "suspended");
          return;
        }
        if (!response.ok) throw new Error("Live catalogue unavailable");
        const bootstrap = (await response.json()) as KioskBootstrap;
        if (!active || version !== requestVersion) return;
        setShopState(null);
        const state = useKioskStore.getState();
        const cartBefore = JSON.stringify(state.cartItems);
        if (!state.hasHydrated) state.hydrate(bootstrap);
        else state.syncBootstrap(bootstrap);
        setBackendStatus("live");
        const syncedState = useKioskStore.getState();
        if (
          state.hasHydrated &&
          cartBefore !== JSON.stringify(syncedState.cartItems)
        ) {
          setToast({
            message:
              "Your cart was updated to match the latest prices and availability.",
            tone: "success",
            screen: syncedState.screen,
          });
          syncedState.clearCartError();
        }
      } catch {
        if (!active || version !== requestVersion) return;
        setBackendStatus("unavailable");
        if (!useKioskStore.getState().hasHydrated) {
          if (vendorSlug) {
            // Only the default storefront may fall back to the bundled
            // catalogue; another shop's customers must never see it.
            setShopState("unreachable");
          } else {
            useKioskStore.getState().hydrate();
          }
        }
      } finally {
        window.clearTimeout(timeout);
        if (currentController === controller) currentController = null;
      }
    };

    void loadBootstrap();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadBootstrap();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      currentController?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialBootstrap only seeds the first hydration
  }, [kioskApiBase, normalizedVendorSlug, vendorSlug]);

  useEffect(() => {
    if (!store.hasHydrated) return;
    const updateOnline = () => setBrowserOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [store.hasHydrated]);

  useEffect(() => {
    if (!store.hasHydrated || store.screen === "welcome" || store.screen === "qr") {
      return;
    }

    lastActivityAt.current = Date.now();
    let lastPersistedAt = 0;
    const recordActivity = () => {
      const now = Date.now();
      lastActivityAt.current = now;
      if (now - lastPersistedAt >= 15_000) {
        useKioskStore.getState().touchSession();
        lastPersistedAt = now;
      }
    };
    const checkInactivity = () => {
      const remaining = KIOSK_IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt.current);
      if (remaining <= 0) {
        useKioskStore.getState().resetSession();
        setIdleWarningSeconds(null);
        setToast({
          message: "For your privacy, the previous kiosk session was cleared.",
          tone: "success",
          screen: "welcome",
        });
        return;
      }
      setIdleWarningSeconds(
        remaining <= KIOSK_IDLE_WARNING_MS
          ? Math.max(1, Math.ceil(remaining / 1_000))
          : null,
      );
    };

    useKioskStore.getState().touchSession();
    const interval = window.setInterval(checkInactivity, 1_000);
    const activityEvents: readonly (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true, capture: true }));
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") checkInactivity();
    };
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      window.clearInterval(interval);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity, { capture: true }));
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [store.hasHydrated, store.screen]);

  useEffect(() => {
    if (!store.hasHydrated) return;

    const fromScreen = previousScreen.current;
    previousScreen.current = store.screen;

    const isProductModalTransition =
      (fromScreen === "catalogue" && store.screen === "product-details") ||
      (fromScreen === "product-details" && store.screen === "catalogue");
    if (isProductModalTransition) return;

    let headingObserver: MutationObserver | undefined;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      const focusTarget = () => {
        const target = document.querySelector<HTMLElement>("[data-screen-heading]");
        if (!target) return false;
        target.focus({ preventScroll: true });
        return true;
      };
      if (!focusTarget()) {
        headingObserver = new MutationObserver(() => {
          if (focusTarget()) headingObserver?.disconnect();
        });
        headingObserver.observe(document.body, { childList: true, subtree: true });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      headingObserver?.disconnect();
    };
  }, [store.hasHydrated, store.screen]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (store.screen !== "qr" || !store.currentOrder) return;
    const timer = window.setInterval(() => useKioskStore.getState().tickCountdown(), 1000);
    return () => window.clearInterval(timer);
  }, [store.screen, store.currentOrder]);

  const showToast = (message: string, tone: "success" | "error" = "success") => setToast({
    message,
    tone,
    screen: useKioskStore.getState().screen,
  });

  const vendorLoginHref = vendorSlug
    ? `/vendor/login?vendor=${encodeURIComponent(normalizedVendorSlug)}`
    : "/vendor/login";
  const openVendorStudio = () => router.push(vendorLoginHref);

  const openCart = () => {
    if (!store.cartItems.length) {
      showToast("Your cart is empty. Add at least one gift first.", "error");
      return;
    }
    store.setScreen("cart");
  };

  const handleCartResult = (result: ReturnType<typeof store.addToCart>, successMessage?: string) => {
    if (!result.ok) {
      showToast(result.error.message, "error");
      return false;
    }
    if (successMessage) showToast(successMessage);
    return true;
  };

  const quickAdd = (product: Product) => {
    handleCartResult(store.addToCart(product.id), `${product.name} added. ${unitCount + 1} of ${store.settings.maxCartQuantity} gifts selected.`);
  };

  const changeQuantity = (key: string, quantity: number) => {
    const result = quantity < 1 ? store.removeFromCart(key) : store.updateCartQuantity(key, quantity);
    handleCartResult(result);
  };

  const removeLine = (key: string) => {
    const line = store.cartItems.find((item) => item.key === key);
    const result = store.removeFromCart(key);
    handleCartResult(result, line ? `${line.productName} removed from your cart.` : undefined);
  };

  const toggleWrap = (key: string) => {
    const line = store.cartItems.find((item) => item.key === key);
    if (!line) return;
    handleCartResult(store.setCartGiftWrapped(key, !line.giftWrapped), line.giftWrapped ? "Gift wrap removed." : "Gift wrap added.");
  };

  const addFromDetails = (input: { productId: string; variantId?: string; quantity: number; giftWrapped: boolean }) => {
    const product = store.products.find((item) => item.id === input.productId);
    const ok = handleCartResult(store.addToCart(input.productId, input), product ? `${product.name} added to your cart.` : "Gift added to your cart.");
    if (ok) store.closeProduct();
  };

  const createOrder = async () => {
    if (generating) return;
    if (!online) {
      showToast(
        "Live ordering is temporarily unavailable. Your cart is safe—reconnect and try again.",
        "error",
      );
      return;
    }
    if (!store.storeOpen) {
      showToast(`The shop has paused new kiosk orders. Please ask a ${store.settings.shopName} team member for help.`, "error");
      return;
    }
    setCopyError(null);
    setGenerating(true);
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    const result = store.createOrder();
    if (!result.ok) {
      setGenerating(false);
      showToast(result.error.message, "error");
      return;
    }
    const controller = new AbortController();
    const orderTimeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const state = useKioskStore.getState();
      const pendingSubmission = state.pendingSubmission;
      if (!pendingSubmission || pendingSubmission.order.id !== result.value.id) {
        throw new Error("The pending order could not be restored. Review the cart and try again.");
      }
      const response = await fetch(`${kioskApiBase}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          idempotencyKey: pendingSubmission.idempotencyKey,
          createdAt: result.value.createdAt,
          kioskName: result.value.kioskName,
          customer: pendingSubmission.customer,
          items: pendingSubmission.items,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { order?: VendorOrder; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.order) {
        throw new Error(
          payload?.error?.message ?? "The vendor queue could not be updated.",
        );
      }
      useKioskStore
        .getState()
        .completeOrderCreation(kioskOrderFromVendor(payload.order));
    } catch (caught) {
      const message =
        caught instanceof DOMException && caught.name === "AbortError"
          ? "The ordering service took too long to respond. Your order is safe to retry."
          : caught instanceof Error
          ? caught.message
          : "The vendor queue could not be updated.";
      useKioskStore.getState().failOrderCreation({
        code: "INVALID_CART",
        message,
      });
      showToast(
        `We could not prepare this order: ${message}`,
        "error",
      );
    } finally {
      window.clearTimeout(orderTimeout);
      setGenerating(false);
    }
  };

  const copyMessage = async () => {
    const message = store.currentOrder?.whatsappMessage;
    if (!message) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = message;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copiedFallback = document.execCommand("copy");
      textArea.remove();
      if (!copiedFallback) {
        setCopyError("Copy was blocked. Select the message preview and copy it manually.");
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  let headerBack: (() => void) | undefined;
  if (store.screen === "cart") headerBack = () => store.setScreen("catalogue");
  if (store.screen === "customer") headerBack = () => store.setScreen("cart");
  if (store.screen === "review") headerBack = () => store.setScreen("customer");

  if (shopState) return <ShopUnavailable kind={shopState} />;

  if (!store.hasHydrated || store.tenantKey !== normalizedVendorSlug) {
    if (initialBootstrap) {
      // Server-rendered shell: the real welcome screen (including the LCP hero
      // image) is in the first HTML; its buttons wake up once hydrated.
      const { shopName, kioskName, showPreviewLabel } = initialBootstrap.settings;
      return <WelcomeScreen shopName={shopName} kioskName={kioskName} showPreviewLabel={showPreviewLabel} online onStart={() => undefined} vendorLoginHref={vendorLoginHref} ready={false} />;
    }
    return <div className="loading-screen"><div className="loading-mark"><Gift size={44} /><span>Preparing this storefront…</span></div></div>;
  }

  const renderScreen = () => {
    if (store.screen === "welcome") {
      return <WelcomeScreen shopName={store.settings.shopName} kioskName={store.settings.kioskName} showPreviewLabel={store.settings.showPreviewLabel} online={online} onStart={store.startShopping} vendorLoginHref={vendorLoginHref} />;
    }

    if (store.screen === "catalogue" || store.screen === "product-details") {
      return (
        <>
          <CatalogueScreen
            products={visibleProducts}
            categories={catalogueCategories}
            selectedCategory={store.selectedCategory}
            searchQuery={store.searchQuery}
            cart={store.cartItems}
            unitCount={unitCount}
            maxUnits={store.settings.maxCartQuantity}
            totals={totals}
            onCategoryChange={store.setSelectedCategory}
            onOpenProduct={(product) => store.openProduct(product.id)}
            onQuickAdd={quickAdd}
            onQuantityChange={changeQuantity}
            onRemove={removeLine}
            onOpenCart={openCart}
            onClearFilters={() => { store.setSearchQuery(""); store.setSelectedCategory("all"); }}
            onNeedHelp={() => showToast(`A ${store.settings.shopName} team member can help you choose or customize a gift.`)}
          />
          {store.screen === "product-details" && selectedProduct ? <ProductDetailModal key={selectedProduct.id} product={selectedProduct} remainingCapacity={remainingCapacity} giftWrapFeePaise={store.settings.giftWrapFeePaise} onClose={store.closeProduct} onAdd={addFromDetails} /> : null}
        </>
      );
    }

    if (store.screen === "cart") {
      return <CartScreen cart={store.cartItems} products={store.products} unitCount={unitCount} maxUnits={store.settings.maxCartQuantity} totals={totals} giftWrapFeePaise={store.settings.giftWrapFeePaise} onQuantityChange={changeQuantity} onRemove={removeLine} onToggleWrap={toggleWrap} onContinueShopping={() => store.setScreen("catalogue")} onCheckout={() => store.setScreen("customer")} />;
    }

    if (store.screen === "customer") {
      return <CheckoutScreen customer={store.customer} cart={store.cartItems} totals={totals} unitCount={unitCount} onChange={store.updateCustomer} onEditSelection={() => store.setScreen("cart")} onReview={() => store.setScreen("review")} />;
    }

    if (store.screen === "review") {
      return <ReviewScreen cart={store.cartItems} totals={totals} customer={store.customer} settings={store.settings} creating={generating || store.isCreatingOrder} onEditGifts={() => store.setScreen("cart")} onEditDetails={() => store.setScreen("customer")} onCreateOrder={createOrder} onOpenSettings={openVendorStudio} />;
    }

    if (store.screen === "qr") {
      if (!store.currentOrder) {
        return <main className="screen-page narrow"><div className="empty-state"><AlertCircle size={46} /><div><h2 data-screen-heading tabIndex={-1}>The prepared order could not be restored</h2><p>Your cart is still available. Return to review and generate the WhatsApp QR again.</p><button className="primary-button" onClick={() => store.setScreen(store.cartItems.length ? "review" : "catalogue")}>Return to order</button></div></div></main>;
      }
      return <QrErrorBoundary key={store.currentOrder.id} order={store.currentOrder} onCopy={copyMessage} onStartNewOrder={store.resetSession}><OrderReadyScreen shopName={store.settings.shopName} order={store.currentOrder} products={store.products} secondsRemaining={store.countdownSeconds} extended={store.qrExtended} copied={copied} copyError={copyError} onCopy={copyMessage} onKeepOpen={store.keepQrOpen} onStartNewOrder={store.resetSession} /></QrErrorBoundary>;
    }

    return null;
  };

  const showHeader = store.screen !== "welcome";

  return (
    <div className={`kiosk-shell kiosk-shell--${store.screen}`}>
      {showHeader ? (
        <KioskHeader
          shopName={store.settings.shopName}
          cartUnits={unitCount}
          maxUnits={store.settings.maxCartQuantity}
          online={online}
          showSearch={store.screen === "catalogue" || store.screen === "product-details"}
          searchValue={store.searchQuery}
          onSearchChange={store.setSearchQuery}
          onCart={openCart}
          onSettings={openVendorStudio}
          onBack={headerBack}
        />
      ) : null}
      {store.screen !== "welcome" && !online ? <div className="offline-notice" role="status">Showing the last available catalogue. Your cart remains usable, but reconnect to validate stock and prepare the WhatsApp QR.</div> : null}
      {store.screen !== "welcome" && online && !store.storeOpen ? <div className="offline-notice" role="status">The shop has paused new orders. You can still browse and build a cart while you wait.</div> : null}
      {renderScreen()}
      {idleWarningSeconds !== null ? (
        <IdleSessionDialog
          secondsRemaining={idleWarningSeconds}
          onContinue={() => {
            lastActivityAt.current = Date.now();
            useKioskStore.getState().touchSession();
            setIdleWarningSeconds(null);
          }}
          onReset={() => {
            useKioskStore.getState().resetSession();
            setIdleWarningSeconds(null);
          }}
        />
      ) : null}
      <div className="toast-region">
        {toast && (toast.screen === store.screen || (toast.screen === "product-details" && store.screen === "catalogue")) ? <div className={`toast ${toast.tone === "error" ? "error" : ""}`} role={toast.tone === "error" ? "alert" : "status"} aria-atomic="true">{toast.tone === "error" ? <AlertCircle size={19} /> : <CheckCircle2 size={19} color="#25683D" />}<span>{toast.message}</span></div> : null}
      </div>
      {store.screen !== "welcome" && store.screen !== "catalogue" && store.screen !== "product-details" && unitCount > 0 ? <div className="sr-only" aria-live="polite"><ShoppingBag size={1} />{unitCount} of {store.settings.maxCartQuantity} gifts selected.</div> : null}
    </div>
  );
}
