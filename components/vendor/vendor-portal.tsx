"use client";

import {
  Boxes,
  ExternalLink,
  Home,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  PackagePlus,
  RefreshCw,
  Settings,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type {
  VendorBootstrap,
  VendorOrder,
  VendorProduct,
  VendorSettings as VendorSettingsType,
} from "@/types/vendor";
import { backgroundRefreshHeaders } from "@/domain/session-activity";
import { ThemeControl } from "../theme-control";
import { vendorRequest, VendorClientError } from "./vendor-client";
import { VendorDashboard } from "./vendor-dashboard";
import { VendorOrders } from "./vendor-orders";
import { VendorProducts } from "./vendor-products";
import { VendorSettings } from "./vendor-settings";

type VendorView = "dashboard" | "products" | "orders" | "settings";

type PortalProps = { initialData: VendorBootstrap };

type RefreshOptions = Readonly<{
  /** Timer-driven: authenticates without counting as user activity. */
  background?: boolean;
  announceError?: boolean;
  failureMessage?: string;
  successMessage?: string;
}>;

type SyncStatus = "synced" | "syncing" | "error";

const viewCopy: Readonly<Record<VendorView, { title: string; description: string }>> = {
  dashboard: {
    title: "Studio overview",
    description: "Orders, stock, and kiosk activity in one calm view.",
  },
  products: {
    title: "Products",
    description: "Manage your inventory, availability, and kiosk catalogue.",
  },
  orders: {
    title: "Orders",
    description: "Confirm and fulfil each customer request with a clear next step.",
  },
  settings: {
    title: "Shop settings",
    description: "Control the kiosk identity, WhatsApp handoff, and ordering rules.",
  },
};

const navigation = [
  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
  { id: "products" as const, label: "Products", icon: Boxes },
  { id: "orders" as const, label: "Orders", icon: ShoppingBag },
  { id: "settings" as const, label: "Shop settings", icon: Settings },
];

function syncLabel(status: SyncStatus, lastSuccessfulSyncAt: number | null) {
  if (status === "syncing") return "Syncing…";
  if (status === "error") return "Sync issue";
  if (lastSuccessfulSyncAt === null) return "Synced";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastSuccessfulSyncAt) / 1_000));
  if (elapsedSeconds < 60) return "Synced now";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  return `Synced ${elapsedMinutes}m ago`;
}

export function VendorPortal({ initialData }: PortalProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<VendorView>("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<number | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openAddRequested, setOpenAddRequested] = useState(false);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const vendorSidebarRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const refreshSequenceRef = useRef(0);
  const vendorSlug = data.vendor.slug;
  const apiBase = `/api/vendor/${encodeURIComponent(vendorSlug)}`;
  // Keep the workspace in the login URL so signing back in returns here.
  const loginPath = `/vendor/login?vendor=${encodeURIComponent(vendorSlug)}`;
  // Same rule as /vendor/select: only active memberships of active vendors.
  const switchableShops = data.user.memberships.filter(
    (membership) => membership.active && membership.vendor.status === "active",
  );
  const canManageCatalogue = data.capabilities.manage_catalogue;
  const canManageSettings = data.capabilities.manage_settings;
  const visibleNavigation = navigation.filter((item) =>
    item.id === "products" ? canManageCatalogue : item.id === "settings" ? canManageSettings : true,
  );

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const updateLayout = () => {
      setMobileLayout(media.matches);
      if (!media.matches) setMobileMenu(false);
    };
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  const closeMobileMenu = useCallback(
    (restoreFocus = true) => {
      const shouldRestoreFocus = restoreFocus && mobileLayout && mobileMenu;
      setMobileMenu(false);
      if (shouldRestoreFocus) {
        window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
      }
    },
    [mobileLayout, mobileMenu],
  );

  useEffect(() => {
    if (!mobileLayout || !mobileMenu) return;
    const sidebar = vendorSidebarRef.current;
    if (!sidebar) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileMenuCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileMenu();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        sidebar.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [closeMobileMenu, mobileLayout, mobileMenu]);

  const refresh = useCallback(
    async (options: RefreshOptions = {}) => {
      const requestSequence = refreshSequenceRef.current + 1;
      refreshSequenceRef.current = requestSequence;
      setRefreshing(true);
      setSyncStatus("syncing");
      try {
        const next = await vendorRequest<VendorBootstrap>(
          `${apiBase}/bootstrap`,
          options.background ? { headers: backgroundRefreshHeaders } : undefined,
        );
        if (requestSequence !== refreshSequenceRef.current) return false;
        startTransition(() => setData(next));
        setLastSuccessfulSyncAt(Date.now());
        setSyncStatus("synced");
        if (options.successMessage) showToast(options.successMessage);
        return true;
      } catch (caught) {
        if (requestSequence !== refreshSequenceRef.current) return false;
        if (caught instanceof VendorClientError && caught.status === 401) {
          router.replace(loginPath);
          return false;
        }
        setSyncStatus("error");
        if (options.announceError) {
          showToast(
            options.failureMessage ??
              (caught instanceof Error ? caught.message : "Could not refresh the studio."),
            "error",
          );
        }
        return false;
      } finally {
        if (requestSequence === refreshSequenceRef.current) {
          setRefreshing(false);
        }
      }
    },
    [apiBase, loginPath, router, showToast],
  );

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    // Polling alone must not keep an unattended studio signed in.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh({ background: true });
    }, 30_000);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [refresh]);

  const selectView = (next: VendorView) => {
    setView(next);
    closeMobileMenu();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addProduct = () => {
    if (!canManageCatalogue) return;
    setView("products");
    setOpenAddRequested(true);
    closeMobileMenu(false);
  };

  const openOrder = (order: VendorOrder) => {
    setFocusOrderId(order.id);
    selectView("orders");
  };

  const commitProduct = useCallback(
    (product: VendorProduct, message: string) => {
      refreshSequenceRef.current += 1;
      setRefreshing(false);
      setSyncStatus("synced");
      setLastSuccessfulSyncAt(Date.now());
      startTransition(() => {
        setData((current) => ({
          ...current,
          revision: current.revision + 1,
          products: [
            product,
            ...current.products.filter((candidate) => candidate.id !== product.id),
          ],
        }));
      });
      showToast(message);
    },
    [showToast],
  );

  const commitArchivedProduct = useCallback(
    (productId: string, message: string) => {
      refreshSequenceRef.current += 1;
      setRefreshing(false);
      setSyncStatus("synced");
      setLastSuccessfulSyncAt(Date.now());
      startTransition(() => {
        setData((current) => ({
          ...current,
          revision: current.revision + 1,
          products: current.products.filter((product) => product.id !== productId),
        }));
      });
      showToast(message);
    },
    [showToast],
  );

  const commitOrder = useCallback(
    (order: VendorOrder, message: string) => {
      refreshSequenceRef.current += 1;
      setRefreshing(false);
      setSyncStatus("synced");
      setLastSuccessfulSyncAt(Date.now());
      startTransition(() => {
        setData((current) => ({
          ...current,
          revision: current.revision + 1,
          orders: [order, ...current.orders.filter((candidate) => candidate.id !== order.id)],
        }));
      });
      showToast(message);
      void refresh({
        announceError: true,
        failureMessage: `${message} The order was saved, but stock and dashboard totals could not be refreshed. Retry sync.`,
      });
    },
    [refresh, showToast],
  );

  const commitSettings = useCallback(
    (settings: VendorSettingsType, message: string) => {
      refreshSequenceRef.current += 1;
      setRefreshing(false);
      setSyncStatus("synced");
      setLastSuccessfulSyncAt(Date.now());
      startTransition(() => {
        setData((current) => ({
          ...current,
          revision: current.revision + 1,
          settings,
        }));
      });
      showToast(message);
    },
    [showToast],
  );

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await vendorRequest("/api/vendor/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.replace(loginPath);
      router.refresh();
    } catch (caught) {
      setLoggingOut(false);
      showToast(
        caught instanceof VendorClientError
          ? caught.message
          : "Could not sign out. Check the connection and try again.",
        "error",
      );
    }
  };

  const copy = viewCopy[view];
  const activeOrders = data.orders.filter(
    (order) => order.status !== "completed" && order.status !== "cancelled",
  ).length;
  const sidebarHidden = mobileLayout && !mobileMenu;
  const currentSyncLabel = syncLabel(syncStatus, lastSuccessfulSyncAt);
  const lastSyncDescription =
    lastSuccessfulSyncAt === null
      ? "the initial studio load"
      : new Intl.DateTimeFormat("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(lastSuccessfulSyncAt));

  return (
    <div className="vendor-app-shell">
      <a
        className="vendor-skip-link"
        href="#vendor-main"
        onClick={(event) => {
          const target = document.getElementById("vendor-main");
          if (!target) return;
          event.preventDefault();
          target.focus();
          target.scrollIntoView?.({ block: "start" });
        }}
      >
        Skip to content
      </a>
      <aside
        ref={vendorSidebarRef}
        id="vendor-sidebar"
        className={`vendor-sidebar${mobileMenu ? " is-open" : ""}`}
        aria-label="Vendor Studio navigation"
        aria-hidden={sidebarHidden || undefined}
        inert={sidebarHidden ? true : undefined}
        tabIndex={-1}
      >
        <div className="vendor-sidebar-brand">
          <span className="vendor-wordmark">Chapega.com</span>
          <span>Vendor studio</span>
          <strong className="vendor-workspace-name">{data.vendor.displayName}</strong>
          <button
            ref={mobileMenuCloseRef}
            className="vendor-sidebar-close"
            type="button"
            onClick={() => closeMobileMenu()}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        {switchableShops.length > 1 || data.user.platformRole === "super_admin" ? (
          <div className="vendor-workspace-links">
            {switchableShops.length > 1 ? (
              <Link href="/vendor/select">
                <Store size={16} /> Switch shop
              </Link>
            ) : null}
            {data.user.platformRole === "super_admin" ? (
              <Link href="/admin">
                <LayoutDashboard size={16} /> Platform admin
              </Link>
            ) : null}
          </div>
        ) : null}
        <nav>
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? "is-selected" : ""}
                onClick={() => selectView(item.id)}
                aria-pressed={view === item.id}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                {item.id === "orders" && activeOrders ? (
                  <b aria-label={`${activeOrders} active orders`}>{activeOrders}</b>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="vendor-sidebar-note" aria-hidden="true">
          <Store size={23} />
          <p>
            Beautiful gifts.
            <br />
            Brighter days.
          </p>
        </div>
        <ThemeControl className="vendor-theme-control" />
        <button
          className="vendor-signout"
          type="button"
          onClick={logout}
          disabled={loggingOut}
          aria-label="Sign out of Vendor Studio"
        >
          {loggingOut ? <LoaderCircle className="vendor-spin" size={19} /> : <LogOut size={19} />}{" "}
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </aside>
      {mobileMenu ? (
        <button
          className="vendor-sidebar-scrim"
          type="button"
          onClick={() => closeMobileMenu()}
          aria-hidden="true"
          tabIndex={-1}
        />
      ) : null}

      <div className="vendor-main" inert={mobileLayout && mobileMenu ? true : undefined}>
        <header className="vendor-topbar">
          <button
            ref={mobileMenuButtonRef}
            className="vendor-mobile-menu"
            type="button"
            onClick={() => setMobileMenu(true)}
            aria-label="Open navigation"
            aria-expanded={mobileMenu}
            aria-controls="vendor-sidebar"
          >
            <Menu size={22} />
          </button>
          <div className="vendor-topbar-title">
            {view === "dashboard" ? (
              <>
                <h1>Welcome back, {data.user.name}</h1>
                <p>
                  Your kiosk is{" "}
                  {data.settings.storeOpen ? "open and ready for customers" : "paused"}.
                </p>
              </>
            ) : (
              <>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
              </>
            )}
          </div>
          <div className="vendor-topbar-actions">
            <button
              className={`vendor-sync-button${syncStatus === "error" ? " has-error" : ""}`}
              type="button"
              onClick={() =>
                void refresh({
                  announceError: true,
                  successMessage: "Vendor Studio refreshed.",
                })
              }
              disabled={refreshing}
              aria-label={
                syncStatus === "error"
                  ? `Vendor data sync failed. Last successful sync: ${lastSyncDescription}. Retry.`
                  : `${currentSyncLabel}. Refresh vendor data.`
              }
              title={
                syncStatus === "error" ? `Last successful sync: ${lastSyncDescription}` : undefined
              }
            >
              <RefreshCw className={refreshing ? "vendor-spin" : ""} size={17} />
              <span>{currentSyncLabel}</span>
            </button>
            {canManageSettings ? (
              <button
                className="vendor-store-state"
                type="button"
                onClick={() => selectView("settings")}
                aria-label={`${data.settings.storeOpen ? "Shop open" : "Shop paused"}. Open shop settings.`}
              >
                <i className={data.settings.storeOpen ? "is-open" : "is-paused"} />
                <span>{data.settings.storeOpen ? "Shop open" : "Shop paused"}</span>
              </button>
            ) : (
              <span
                className="vendor-store-state"
                aria-label={data.settings.storeOpen ? "Shop open" : "Shop paused"}
              >
                <i className={data.settings.storeOpen ? "is-open" : "is-paused"} />
                <span>{data.settings.storeOpen ? "Shop open" : "Shop paused"}</span>
              </span>
            )}
            <a
              className="vendor-secondary vendor-view-kiosk"
              href={`/kiosk/${encodeURIComponent(vendorSlug)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View kiosk <ExternalLink size={15} />
            </a>
            {canManageCatalogue && (view === "dashboard" || view === "products") ? (
              <button
                className="vendor-primary vendor-topbar-add"
                type="button"
                onClick={addProduct}
              >
                <PackagePlus size={18} /> Add product
              </button>
            ) : null}
            <button
              className="vendor-secondary vendor-topbar-signout"
              type="button"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Sign out of Vendor Studio"
            >
              {loggingOut ? (
                <LoaderCircle className="vendor-spin" size={18} />
              ) : (
                <LogOut size={18} />
              )}
              <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </header>

        <main id="vendor-main" className="vendor-content" tabIndex={-1}>
          <div className="vendor-mobile-heading">
            {view === "dashboard" ? (
              <>
                <h1>Welcome back, {data.user.name}</h1>
                <p>{copy.description}</p>
              </>
            ) : (
              <>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
              </>
            )}
          </div>

          {view === "dashboard" ? (
            <VendorDashboard
              data={data}
              canManageCatalogue={canManageCatalogue}
              onViewOrders={() => selectView("orders")}
              onViewProducts={() => selectView("products")}
              onAddProduct={addProduct}
              onOpenOrder={openOrder}
            />
          ) : null}
          {view === "products" ? (
            <VendorProducts
              apiBase={apiBase}
              products={data.products}
              lowStockThreshold={data.settings.lowStockThreshold}
              openAddRequested={openAddRequested}
              onAddRequestHandled={() => setOpenAddRequested(false)}
              onProductSaved={commitProduct}
              onProductArchived={commitArchivedProduct}
            />
          ) : null}
          {view === "orders" ? (
            <VendorOrders
              apiBase={apiBase}
              orders={data.orders}
              focusOrderId={focusOrderId}
              onFocusOrderHandled={() => setFocusOrderId(null)}
              onOrderSaved={commitOrder}
            />
          ) : null}
          {view === "settings" ? (
            <VendorSettings
              apiBase={apiBase}
              settings={data.settings}
              onSettingsSaved={commitSettings}
            />
          ) : null}
        </main>
      </div>

      <nav
        className="vendor-bottom-nav"
        aria-label="Mobile vendor navigation"
        inert={mobileLayout && mobileMenu ? true : undefined}
      >
        <button
          type="button"
          className={view === "dashboard" ? "is-selected" : ""}
          onClick={() => selectView("dashboard")}
          aria-pressed={view === "dashboard"}
        >
          <Home size={20} />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={view === "orders" ? "is-selected" : ""}
          onClick={() => selectView("orders")}
          aria-pressed={view === "orders"}
        >
          <ShoppingBag size={20} />
          <span>Orders</span>
          {activeOrders ? <b aria-label={`${activeOrders} active orders`}>{activeOrders}</b> : null}
        </button>
        {canManageCatalogue ? (
          <button
            type="button"
            className={view === "products" ? "is-selected" : ""}
            onClick={() => selectView("products")}
            aria-pressed={view === "products"}
          >
            <Boxes size={20} />
            <span>Products</span>
          </button>
        ) : null}
        {canManageSettings ? (
          <button
            type="button"
            className={view === "settings" ? "is-selected" : ""}
            onClick={() => selectView("settings")}
            aria-pressed={view === "settings"}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
        ) : null}
      </nav>

      <div className="vendor-toast-region" aria-live="polite" aria-atomic="true">
        {toast ? (
          <div className={`vendor-toast vendor-toast--${toast.tone}`}>{toast.message}</div>
        ) : null}
      </div>
    </div>
  );
}
