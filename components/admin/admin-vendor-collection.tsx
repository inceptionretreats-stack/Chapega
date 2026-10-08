"use client";

import {
  ChevronRight,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminVendorStatus, AdminVendorSummary } from "@/types/admin";
import {
  AdminVendorStatus as VendorStatus,
  relativeAdminTime,
  VendorAvatar,
} from "./admin-shared";

type AdminVendorCollectionProps = {
  vendors: readonly AdminVendorSummary[];
  onAdd: () => void;
  onChangeStatus: (vendor: AdminVendorSummary) => void;
};

export function AdminVendorCollection({
  vendors,
  onAdd,
  onChangeStatus,
}: AdminVendorCollectionProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AdminVendorStatus>("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-IN");
    return vendors.filter((vendor) => {
      if (status !== "all" && vendor.status !== status) return false;
      if (!normalized) return true;
      return [
        vendor.displayName,
        vendor.slug,
        vendor.owner.name,
        vendor.owner.email,
      ]
        .join(" ")
        .toLocaleLowerCase("en-IN")
        .includes(normalized);
    });
  }, [query, status, vendors]);

  return (
    <section className="admin-vendors" id="vendor-management" tabIndex={-1} aria-labelledby="admin-vendors-title">
      <header className="admin-vendors__header">
        <div>
          <h2 id="admin-vendors-title">Vendors</h2>
          <p>Manage and view all registered vendors</p>
        </div>
        <button className="admin-primary" type="button" onClick={onAdd}>
          <Plus size={20} aria-hidden="true" /> Add vendor
        </button>
      </header>

      <div className="admin-vendor-filters" aria-label="Vendor filters">
        <label className="admin-search-field">
          <Search size={20} aria-hidden="true" />
          <span className="sr-only">Search vendors</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search vendors"
          />
        </label>
        <label className="admin-select-field">
          <span className="sr-only">Filter vendors by status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | AdminVendorStatus)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </div>

      <p className="admin-result-count" aria-live="polite">
        Showing {filtered.length} of {vendors.length} vendors
      </p>

      {filtered.length ? (
        <div id="vendor-accounts" tabIndex={-1} role="group" aria-label="Vendor owner accounts">
          <div className="admin-vendor-table-wrap">
            <table className="admin-vendor-table">
              <caption className="sr-only">Platform vendors</caption>
              <thead>
                <tr>
                  <th scope="col">Vendor</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Store status</th>
                  <th scope="col">Products</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Last activity</th>
                  <th scope="col"><span className="sr-only">Vendor action</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vendor) => (
                  <tr key={vendor.id}>
                    <th scope="row">
                      <span className="admin-vendor-identity">
                        <VendorAvatar name={vendor.displayName} compact />
                        <span><strong>{vendor.displayName}</strong><small>/kiosk/{vendor.slug}</small></span>
                      </span>
                    </th>
                    <td><strong>{vendor.owner.name}</strong><small>{vendor.owner.email}</small></td>
                    <td><VendorStatus status={vendor.status} /></td>
                    <td>{vendor.productCount}</td>
                    <td>{vendor.orderCount}</td>
                    <td><time dateTime={vendor.lastActivityAt} suppressHydrationWarning>{relativeAdminTime(vendor.lastActivityAt)}</time></td>
                    <td>
                      <button
                        className="admin-row-action"
                        type="button"
                        onClick={() => onChangeStatus(vendor)}
                        aria-label={`${vendor.status === "active" ? "Suspend" : "Reactivate"} ${vendor.displayName}`}
                      >
                        {vendor.status === "active" ? <PauseCircle size={18} /> : <PlayCircle size={18} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="admin-vendor-list" aria-label="Platform vendors">
            {filtered.map((vendor) => (
              <li key={vendor.id}>
                <VendorAvatar name={vendor.displayName} />
                <div className="admin-vendor-list__body">
                  <strong>{vendor.displayName}</strong>
                  <span>{vendor.owner.name}</span>
                  <VendorStatus status={vendor.status} />
                  <small>{vendor.productCount} products <i>•</i> {vendor.orderCount} {vendor.orderCount === 1 ? "order" : "orders"}</small>
                </div>
                <button
                  className="admin-vendor-list__action"
                  type="button"
                  onClick={() => onChangeStatus(vendor)}
                  aria-label={`${vendor.status === "active" ? "Suspend" : "Reactivate"} ${vendor.displayName}`}
                >
                  <ChevronRight size={24} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="admin-empty-state">
          <Search size={25} aria-hidden="true" />
          <div>
            <strong>No vendors match</strong>
            <p>Clear the search or choose another status.</p>
          </div>
        </div>
      )}
    </section>
  );
}
