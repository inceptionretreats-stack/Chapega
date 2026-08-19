"use client";

import { AlertCircle, CheckCircle2, Gift, ShoppingBag } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { CATALOGUE_CATEGORIES } from "@/data/catalogue";
import type { KioskScreen, PresenterSettings, Product } from "@/types/kiosk";
import {
  selectCartTotals,
  selectCartUnitCount,
  selectOwnerNumberIsConfigured,
  selectRemainingCartCapacity,
  selectSelectedProduct,
  selectVisibleProducts,
  useKioskStore,
} from "@/store/kiosk-store";
import { ApprovalSummary } from "./approval-summary";
import { CartScreen } from "./cart-screen";
import { CatalogueScreen } from "./catalogue-screen";
import { CheckoutScreen } from "./checkout-screen";
import { KioskHeader } from "./kiosk-header";
import { PresenterScreen } from "./presenter-screen";
import { ProductDetailModal } from "./product-detail-modal";
import { QrErrorBoundary } from "./qr-error-boundary";
import { ReviewScreen } from "./review-screen";
import { SetupModal } from "./setup-modal";
import { WelcomeScreen } from "./welcome-screen";

const SETUP_DISMISSED_KEY = "gift-kiosk-setup-dismissed-v2";

const OrderReadyScreen = dynamic(
  () => import("./order-ready-screen").then((module) => module.OrderReadyScreen),
  { loading: () => <div className="loading-screen"><div className="loading-mark"><Gift size={40} /><span>Preparing your QR…</span></div></div>, ssr: false },
);

type ToastState = { message: string; tone: "success" | "error" } | null;

export function KioskApp() {
  const store = useKioskStore();
  const [online, setOnline] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const presenterReturnScreen = useRef<KioskScreen>("welcome");
  const presenterQueryConsumed = useRef(false);

  const unitCount = selectCartUnitCount(store);
  const remainingCapacity = selectRemainingCartCapacity(store);
  const totals = selectCartTotals(store);
  const selectedProduct = selectSelectedProduct(store);
  const visibleProducts = selectVisibleProducts(store);
  const ownerConfigured = selectOwnerNumberIsConfigured(store);

  useEffect(() => {
    useKioskStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!store.hasHydrated) return;
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [store.hasHydrated]);

  useEffect(() => {
    if (!store.hasHydrated) return;
    if (!presenterQueryConsumed.current) {
      presenterQueryConsumed.current = true;
      const url = new URL(window.location.href);
      const presenterRequested = url.searchParams.get("presenter") === "1";
      if (presenterRequested) {
        url.searchParams.delete("presenter");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        presenterReturnScreen.current = store.screen;
        if (store.screen !== "presenter") {
          useKioskStore.getState().setScreen("presenter");
          return;
        }
      }
    }
    if (!store.settings.ownerWhatsAppNumber && store.screen === "welcome") {
      let shouldOpen = true;
      try {
        shouldOpen = window.localStorage.getItem(SETUP_DISMISSED_KEY) !== "1";
      } catch { /* use the first-run setup when storage is unavailable */ }
      const timer = window.setTimeout(() => setSetupOpen(shouldOpen), 0);
      return () => window.clearTimeout(timer);
    }
  }, [store.hasHydrated, store.screen, store.settings.ownerWhatsAppNumber]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (store.screen !== "qr" || !store.currentOrder || store.isCountdownPaused) return;
    const timer = window.setInterval(() => useKioskStore.getState().tickCountdown(), 1000);
    return () => window.clearInterval(timer);
  }, [store.screen, store.currentOrder, store.isCountdownPaused]);

  const showToast = (message: string, tone: "success" | "error" = "success") => setToast({ message, tone });

  const openPresenter = () => {
    if (store.screen !== "presenter") presenterReturnScreen.current = store.screen;
    store.setScreen("presenter");
  };

  const closePresenter = () => {
    const next = presenterReturnScreen.current === "presenter" ? "welcome" : presenterReturnScreen.current;
    store.setScreen(next);
  };

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

  const saveSetup = (patch: Partial<PresenterSettings>) => {
    const result = store.updateSettings(patch);
    if (!result.ok) return result.error.message;
    try { window.localStorage.setItem(SETUP_DISMISSED_KEY, "1"); } catch { /* in-memory settings still work */ }
    setSetupOpen(false);
    showToast("Shop WhatsApp setup saved.");
    return null;
  };

  const skipSetup = () => {
    try { window.localStorage.setItem(SETUP_DISMISSED_KEY, "1"); } catch { /* setup can be skipped for this session */ }
    setSetupOpen(false);
  };

  const resetAllLocalData = () => {
    try { window.localStorage.removeItem(SETUP_DISMISSED_KEY); } catch { /* the store still resets in memory */ }
    presenterReturnScreen.current = "welcome";
    store.resetAllLocalData();
    setSetupOpen(true);
    showToast("All local kiosk data was reset.");
  };

  const savePresenterSettings = (settings: PresenterSettings) => {
    const result = store.updateSettings(settings);
    if (!result.ok) return result.error.message;
    showToast("Presenter settings saved.");
    return null;
  };

  const createOrder = async () => {
    if (generating) return;
    setGenerating(true);
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    const result = store.createOrder();
    setGenerating(false);
    if (!result.ok) showToast(result.error.message, "error");
  };

  const copyMessage = async () => {
    const message = store.currentOrder?.whatsappMessage;
    if (!message) return;
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
        showToast("Copy was blocked. Select the message preview and copy it manually.", "error");
        return;
      }
    }
    setCopied(true);
    showToast("Order message copied.");
    window.setTimeout(() => setCopied(false), 2200);
  };

  let headerBack: (() => void) | undefined;
  if (store.screen === "cart") headerBack = () => store.setScreen("catalogue");
  if (store.screen === "customer" || store.screen === "checkout") headerBack = () => store.setScreen("cart");
  if (store.screen === "review") headerBack = () => store.setScreen("customer");
  if (store.screen === "approval") headerBack = () => store.setScreen(store.currentOrder ? "qr" : "welcome");

  if (!store.hasHydrated) {
    return <div className="loading-screen"><div className="loading-mark"><Gift size={44} /><span>Preparing Chapega.com…</span></div></div>;
  }

  const renderScreen = () => {
    if (store.screen === "welcome") {
      return <WelcomeScreen showPreviewLabel={store.settings.showPreviewLabel} ownerConfigured={ownerConfigured} online={online} onStart={store.startShopping} onSettings={openPresenter} />;
    }

    if (store.screen === "catalogue" || store.screen === "product-details") {
      return (
        <>
          <CatalogueScreen
            products={visibleProducts}
            categories={CATALOGUE_CATEGORIES}
            selectedCategory={store.selectedCategory}
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
            onNeedHelp={() => showToast("A Chapega.com team member can help you choose or customize a gift.")}
          />
          {store.screen === "product-details" && selectedProduct ? <ProductDetailModal key={selectedProduct.id} product={selectedProduct} remainingCapacity={remainingCapacity} onClose={store.closeProduct} onAdd={addFromDetails} /> : null}
        </>
      );
    }

    if (store.screen === "cart") {
      return <CartScreen cart={store.cartItems} products={store.products} unitCount={unitCount} maxUnits={store.settings.maxCartQuantity} totals={totals} giftWrapFeePaise={store.settings.giftWrapFeePaise} onQuantityChange={changeQuantity} onRemove={removeLine} onToggleWrap={toggleWrap} onContinueShopping={() => store.setScreen("catalogue")} onCheckout={() => store.setScreen("customer")} />;
    }

    if (store.screen === "customer" || store.screen === "checkout") {
      return <CheckoutScreen customer={store.customer} totals={totals} unitCount={unitCount} onChange={store.updateCustomer} onReview={() => store.setScreen("review")} />;
    }

    if (store.screen === "review") {
      return <ReviewScreen cart={store.cartItems} totals={totals} customer={store.customer} settings={store.settings} creating={generating || store.isCreatingOrder} onEdit={() => store.setScreen("customer")} onCreateOrder={createOrder} onOpenSettings={openPresenter} />;
    }

    if (store.screen === "qr") {
      if (!store.currentOrder) {
        return <main className="screen-page narrow"><div className="empty-state"><AlertCircle size={46} /><div><h2>The prepared order could not be restored</h2><p>Your cart is still available. Return to review and generate the WhatsApp QR again.</p><button className="primary-button" onClick={() => store.setScreen(store.cartItems.length ? "review" : "catalogue")}>Return to order</button></div></div></main>;
      }
      return <QrErrorBoundary key={store.currentOrder.id} order={store.currentOrder} onCopy={copyMessage} onStartNewOrder={store.resetSession}><OrderReadyScreen order={store.currentOrder} products={store.products} secondsRemaining={store.countdownSeconds} paused={store.isCountdownPaused} copied={copied} onCopy={copyMessage} onTogglePause={store.isCountdownPaused ? store.resumeCountdown : store.keepQrOpen} onStartNewOrder={store.resetSession} onApprovalSummary={() => store.setScreen("approval")} /></QrErrorBoundary>;
    }

    if (store.screen === "presenter") {
      return <PresenterScreen settings={store.settings} history={store.orderHistory} storageWarning={store.storageAvailable ? null : "Settings could not be saved in this browser. You can continue for this session, but settings may reset after closing the page."} onSave={savePresenterSettings} onResetSession={store.resetSession} onResetAll={resetAllLocalData} onClearHistory={store.clearOrderHistory} onClose={closePresenter} />;
    }

    if (store.screen === "approval") {
      return <ApprovalSummary confirmed={store.currentOrder?.status === "presenter_marked_sent"} onConfirmReceipt={store.markCurrentOrderAsSent} onStartAnother={store.resetSession} />;
    }

    return null;
  };

  const showHeader = store.screen !== "welcome" && store.screen !== "presenter";

  return (
    <div className="kiosk-shell">
      {showHeader ? (
        <KioskHeader
          cartUnits={unitCount}
          maxUnits={store.settings.maxCartQuantity}
          online={online}
          showSearch={store.screen === "catalogue" || store.screen === "product-details"}
          searchValue={store.searchQuery}
          onSearchChange={store.setSearchQuery}
          onCart={openCart}
          onSettings={openPresenter}
          onBack={headerBack}
        />
      ) : null}
      {!online && store.screen !== "welcome" ? <div className="offline-notice">You can browse and review gifts offline, but internet access is required to open WhatsApp on the scanning phone.</div> : null}
      {renderScreen()}
      {setupOpen && store.screen === "welcome" ? <SetupModal settings={store.settings} onSave={saveSetup} onSkip={skipSetup} /> : null}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast ? <div className={`toast ${toast.tone === "error" ? "error" : ""}`}>{toast.tone === "error" ? <AlertCircle size={19} /> : <CheckCircle2 size={19} color="#25683D" />}<span>{toast.message}</span></div> : null}
      </div>
      {store.screen !== "welcome" && store.screen !== "catalogue" && store.screen !== "product-details" && unitCount > 0 ? <div className="sr-only" aria-live="polite"><ShoppingBag size={1} />{unitCount} of {store.settings.maxCartQuantity} gifts selected.</div> : null}
    </div>
  );
}
