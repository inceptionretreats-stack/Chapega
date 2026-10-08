"use client";

import {
  Boxes,
  ChevronDown,
  Home,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Store,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  AdminBootstrap,
  AdminVendorMutationResult,
  AdminVendorSummary,
} from "@/types/admin";
import { ThemeControl } from "../theme-control";
import { AddVendorDialog } from "./add-vendor-dialog";
import { AdminActivityRail } from "./admin-activity-rail";
import { adminRequest, AdminClientError } from "./admin-client";
import { AdminAccountAvatar, AdminSkipLink } from "./admin-shared";
import { AdminVendorCollection } from "./admin-vendor-collection";
import { PlatformMetricBand } from "./platform-metric-band";
import { VendorStatusDialog } from "./vendor-status-dialog";

type AdminPortalProps = {
  initialData: AdminBootstrap;
};

type NavigationId = "overview" | "vendors" | "orders" | "accounts";

const navigation = [
  { id: "overview" as const, label: "Overview", icon: Home, target: "platform-overview" },
  { id: "vendors" as const, label: "Vendors", icon: Store, target: "vendor-management" },
  { id: "orders" as const, label: "Orders", icon: Package, target: "admin-orders-summary" },
  { id: "accounts" as const, label: "Accounts", icon: UsersRound, target: "vendor-accounts" },
];

export function AdminPortal({ initialData }: AdminPortalProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [activeNavigation, setActiveNavigation] = useState<NavigationId>("overview");
  const [accountOpen, setAccountOpen] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [statusVendor, setStatusVendor] = useState<AdminVendorSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const refreshSequenceRef = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
        return;
      }
      if (event instanceof MouseEvent && !accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [accountOpen]);

  const refresh = useCallback(async (announce = false) => {
    const sequence = refreshSequenceRef.current + 1;
    refreshSequenceRef.current = sequence;
    setRefreshing(true);
    try {
      const next = await adminRequest<AdminBootstrap>("/api/admin/bootstrap");
      if (sequence !== refreshSequenceRef.current) return;
      startTransition(() => setData(next));
      if (announce) setToast({ message: "Platform data refreshed.", tone: "success" });
    } catch (caught) {
      if (sequence !== refreshSequenceRef.current) return;
      if (caught instanceof AdminClientError && caught.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (announce) {
        setToast({
          message: caught instanceof Error ? caught.message : "Platform data could not be refreshed.",
          tone: "error",
        });
      }
    } finally {
      if (sequence === refreshSequenceRef.current) setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(refreshWhenVisible, 45_000);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [refresh]);

  const navigate = (id: NavigationId, target: string) => {
    setActiveNavigation(id);
    const element = document.getElementById(target);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (element instanceof HTMLElement) {
      window.requestAnimationFrame(() => element.focus({ preventScroll: true }));
    }
  };

  const applyMutation = (result: AdminVendorMutationResult, message: string) => {
    refreshSequenceRef.current += 1;
    startTransition(() => {
      setData((current) => ({
        ...current,
        metrics: result.metrics,
        vendors: [
          result.vendor,
          ...current.vendors.filter((vendor) => vendor.id !== result.vendor.id),
        ],
        recentActivity: [
          result.activity,
          ...current.recentActivity.filter((activity) => activity.id !== result.activity.id),
        ].slice(0, 12),
      }));
    });
    setAddingVendor(false);
    setStatusVendor(null);
    setToast({ message, tone: "success" });
    void refresh();
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await adminRequest<{ ok: true }>("/api/admin/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.replace("/admin/login");
      router.refresh();
    } catch (caught) {
      setLoggingOut(false);
      setToast({
        message: caught instanceof Error ? caught.message : "Could not sign out. Try again.",
        tone: "error",
      });
    }
  };

  return (
    <div className="admin-shell">
      <AdminSkipLink targetId="admin-main" />

      <aside className="admin-sidebar" aria-label="Platform administration navigation">
        <div className="admin-sidebar__brand">
          <span className="admin-wordmark">Chapega.com</span>
          <span>Platform admin</span>
        </div>
        <nav>
          {navigation.map(({ id, label, icon: Icon, target }) => (
            <button
              key={id}
              type="button"
              className={activeNavigation === id ? "is-selected" : ""}
              onClick={() => navigate(id, target)}
              aria-pressed={activeNavigation === id}
            >
              <Icon size={20} strokeWidth={1.9} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__motif" aria-hidden="true">
          <Boxes size={26} strokeWidth={1.5} />
          <p>Thoughtful gifting,<br />better together.</p>
        </div>
      </aside>

      <div className="admin-page">
        <header className="admin-topbar">
          <div className="admin-topbar__mobile-brand">
            <span className="admin-wordmark">Chapega.com</span>
            <span>Platform admin</span>
          </div>
          <button
            className="admin-refresh"
            type="button"
            onClick={() => void refresh(true)}
            disabled={refreshing}
            aria-label="Refresh platform data"
          >
            <RefreshCw className={refreshing ? "admin-spin" : ""} size={17} />
            <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <div className="admin-account" ref={accountRef}>
            <button
              ref={accountButtonRef}
              className="admin-account__button"
              type="button"
              onClick={() => setAccountOpen((open) => !open)}
              aria-expanded={accountOpen}
              aria-controls="admin-account-menu"
            >
              <AdminAccountAvatar />
              <span>Super admin</span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            {accountOpen ? (
              <div className="admin-account__menu" id="admin-account-menu">
                <div><strong>{data.user.name}</strong><span>{data.user.email}</span></div>
                <ThemeControl className="admin-theme-control" />
                <button type="button" onClick={logout} disabled={loggingOut}>
                  {loggingOut ? <LoaderCircle className="admin-spin" size={18} /> : <LogOut size={18} />}
                  {loggingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main id="admin-main" tabIndex={-1} className="admin-main">
          <section
            className="admin-overview-heading"
            id="platform-overview"
            tabIndex={-1}
            aria-labelledby="platform-overview-title"
          >
            <div>
              <h1 id="platform-overview-title">Platform overview</h1>
              <p>Monitor every vendor, storefront, and order from one place.</p>
            </div>
            <button className="admin-primary admin-heading-add" type="button" onClick={() => setAddingVendor(true)}>
              <Plus size={19} /> Add vendor
            </button>
          </section>

          <PlatformMetricBand metrics={data.metrics} />

          <div className="admin-content-grid">
            <AdminVendorCollection
              vendors={data.vendors}
              onAdd={() => setAddingVendor(true)}
              onChangeStatus={setStatusVendor}
            />
            <AdminActivityRail items={data.recentActivity} />
          </div>
        </main>
      </div>

      <nav className="admin-bottom-nav" aria-label="Mobile platform administration navigation">
        {navigation.map(({ id, label, icon: Icon, target }) => (
          <button
            key={id}
            type="button"
            className={activeNavigation === id ? "is-selected" : ""}
            onClick={() => navigate(id, target)}
            aria-pressed={activeNavigation === id}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {addingVendor ? (
        <AddVendorDialog
          onClose={() => setAddingVendor(false)}
          onCreated={(result) => applyMutation(result, `${result.vendor.displayName} is ready.`)}
        />
      ) : null}

      {statusVendor ? (
        <VendorStatusDialog
          vendor={statusVendor}
          onClose={() => setStatusVendor(null)}
          onSaved={(result) => applyMutation(
            result,
            `${result.vendor.displayName} is now ${result.vendor.status}.`,
          )}
        />
      ) : null}

      <div className="admin-toast-region" aria-live="polite" aria-atomic="true">
        {toast ? <div className={`admin-toast admin-toast--${toast.tone}`}>{toast.message}</div> : null}
      </div>
    </div>
  );
}
