"use client";

import Image from "next/image";
import {
  ArrowRight,
  Box,
  CircleDollarSign,
  ExternalLink,
  PackagePlus,
  ShoppingBag,
  Store,
} from "lucide-react";
import { formatInr } from "@/domain/money";
import type { VendorBootstrap, VendorOrder } from "@/types/vendor";
import { relativeVendorTime, VendorOrderStatusBadge } from "./vendor-shared";

type DashboardProps = {
  data: VendorBootstrap;
  canManageCatalogue?: boolean;
  onViewOrders: () => void;
  onViewProducts: () => void;
  onAddProduct: () => void;
  onOpenOrder: (order: VendorOrder) => void;
};

function isToday(value: string): boolean {
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function VendorDashboard({
  data,
  canManageCatalogue = true,
  onViewOrders,
  onViewProducts,
  onAddProduct,
  onOpenOrder,
}: DashboardProps) {
  const todayOrders = data.orders.filter((order) => isToday(order.createdAt));
  const activeOrders = data.orders.filter(
    (order) => order.status !== "completed" && order.status !== "cancelled",
  );
  const todayRevenue = todayOrders
    .filter((order) => order.status !== "cancelled")
    .reduce((total, order) => total + order.totalPaise, 0);
  const visibleProducts = data.products.filter((product) => product.visible);
  const lowStock = data.products
    .filter((product) => product.visible && product.stock <= data.settings.lowStockThreshold)
    .sort((left, right) => left.stock - right.stock);
  const lowStockPreview = lowStock.slice(0, 4);

  return (
    <div className="vendor-workspace vendor-dashboard">
      <section className="vendor-summary-band" aria-labelledby="today-summary-title">
        <div className="vendor-summary-heading">
          <p id="today-summary-title">Today</p>
          <span>
            {new Intl.DateTimeFormat("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </span>
        </div>
        <div className="vendor-summary-stat">
          <span className="vendor-summary-icon">
            <ShoppingBag size={21} />
          </span>
          <div>
            <strong>{todayOrders.length}</strong>
            <span>Orders</span>
          </div>
        </div>
        <div className="vendor-summary-stat vendor-summary-stat--wide">
          <span className="vendor-summary-icon">
            <CircleDollarSign size={21} />
          </span>
          <div>
            <strong>{formatInr(todayRevenue)}</strong>
            <span>Order value</span>
          </div>
        </div>
        <div className="vendor-summary-divider" aria-hidden="true" />
        <div className="vendor-summary-stat">
          <span className="vendor-summary-icon">
            <Box size={21} />
          </span>
          <div>
            <strong>{visibleProducts.length}</strong>
            <span>Products live</span>
          </div>
        </div>
        <div className="vendor-summary-stat">
          <span className="vendor-summary-icon">
            <PackagePlus size={21} />
          </span>
          <div>
            <strong>{lowStock.length}</strong>
            <span>Low stock</span>
          </div>
        </div>
        <p className="vendor-summary-quote">
          Small moments.
          <br />
          Big meaning.
        </p>
      </section>

      <div className="vendor-dashboard-grid">
        <section className="vendor-panel vendor-live-orders" aria-labelledby="live-orders-title">
          <header className="vendor-panel-header">
            <div>
              <h2 id="live-orders-title">Live orders</h2>
              <p>Orders prepared at the kiosk. Confirm only after the shop receives the request.</p>
            </div>
            <button className="vendor-text-action" type="button" onClick={onViewOrders}>
              View all <ArrowRight size={17} />
            </button>
          </header>

          {activeOrders.length ? (
            <div className="vendor-table-wrap">
              <table className="vendor-table vendor-dashboard-orders">
                <caption className="sr-only">Active kiosk orders</caption>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Time</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders.slice(0, 6).map((order) => (
                    <tr key={order.id}>
                      <td data-label="Order">
                        <strong>{order.orderNumber}</strong>
                        <small>{order.kioskName}</small>
                      </td>
                      <td data-label="Time">
                        <span suppressHydrationWarning>{relativeVendorTime(order.createdAt)}</span>
                      </td>
                      <td data-label="Customer">
                        {order.customer.customerName || "Walk-in customer"}
                      </td>
                      <td data-label="Items">
                        {order.items.reduce((total, item) => total + item.quantity, 0)}
                      </td>
                      <td data-label="Total">
                        <strong>{formatInr(order.totalPaise)}</strong>
                      </td>
                      <td data-label="Status">
                        <VendorOrderStatusBadge status={order.status} />
                      </td>
                      <td>
                        <button
                          className="vendor-row-action"
                          type="button"
                          onClick={() => onOpenOrder(order)}
                          aria-label={`Open ${order.orderNumber}`}
                        >
                          <ArrowRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vendor-panel-empty">
              <span>
                <ShoppingBag size={27} />
              </span>
              <div>
                <strong>No active orders</strong>
                <p>New kiosk orders will appear here as soon as they are prepared.</p>
              </div>
            </div>
          )}
        </section>

        <aside className="vendor-dashboard-rail">
          <section className="vendor-panel vendor-low-stock" aria-labelledby="low-stock-title">
            <header className="vendor-panel-header vendor-panel-header--compact">
              <div>
                <h2 id="low-stock-title">Low stock</h2>
                <p>At or below {data.settings.lowStockThreshold} units.</p>
              </div>
              {canManageCatalogue ? (
                <button className="vendor-text-action" type="button" onClick={onViewProducts}>
                  View all <ArrowRight size={16} />
                </button>
              ) : null}
            </header>
            {lowStock.length ? (
              <ul className="vendor-stock-list">
                {lowStockPreview.map((product) => (
                  <li key={product.id}>
                    <Image src={product.image} alt="" width={52} height={52} sizes="52px" />
                    <div>
                      <strong>{product.name}</strong>
                      <span className={product.stock === 0 ? "is-out" : ""}>
                        {product.stock === 0 ? "Sold out" : `${product.stock} left`}
                      </span>
                    </div>
                    {canManageCatalogue ? (
                      <button type="button" onClick={onViewProducts}>
                        Restock
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="vendor-compact-empty">
                <Box size={22} />
                <div>
                  <strong>Stock looks healthy</strong>
                  <p>No product is below the alert level.</p>
                </div>
              </div>
            )}
          </section>

          <section className="vendor-panel vendor-shop-status" aria-labelledby="shop-status-title">
            <h2 id="shop-status-title">Shop status</h2>
            <div className="vendor-shop-status-line">
              <span className={data.settings.storeOpen ? "is-open" : "is-closed"} />
              <div>
                <strong>{data.settings.storeOpen ? "Open" : "Paused"}</strong>
                <p>
                  {data.settings.storeOpen
                    ? "Kiosk is live and accepting orders."
                    : "Ordering is currently paused."}
                </p>
              </div>
            </div>
            <dl>
              <div>
                <dt>
                  <Store size={17} /> Kiosk
                </dt>
                <dd>{data.settings.kioskName}</dd>
              </div>
              <div>
                <dt>
                  <ExternalLink size={17} /> Catalogue revision
                </dt>
                <dd>#{data.revision}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <section className="vendor-curation-callout">
        <span>
          <PackagePlus size={24} />
        </span>
        <div>
          <h2>Curate more joy</h2>
          <p>Add a fresh product and it will become available to the kiosk after publishing.</p>
        </div>
        {canManageCatalogue ? (
          <button className="vendor-primary" type="button" onClick={onAddProduct}>
            <PackagePlus size={18} /> Add product
          </button>
        ) : null}
      </section>
    </div>
  );
}
