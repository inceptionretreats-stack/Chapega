import { Boxes, Package, Store, UsersRound } from "lucide-react";
import type { AdminPlatformMetrics } from "@/types/admin";

type MetricBandProps = {
  metrics: AdminPlatformMetrics;
};

export function PlatformMetricBand({ metrics }: MetricBandProps) {
  const items = [
    {
      label: "Total vendors",
      mobileLabel: "Vendors",
      value: metrics.totalVendors,
      icon: UsersRound,
    },
    {
      label: "Active stores",
      mobileLabel: "Active",
      value: metrics.activeVendors,
      icon: Store,
      healthy: true,
    },
    {
      label: "Orders",
      mobileLabel: "Orders",
      value: metrics.orderCount,
      icon: Package,
      id: "admin-orders-summary",
    },
    {
      label: "Products",
      mobileLabel: "Products",
      value: metrics.productCount,
      icon: Boxes,
    },
  ] as const;

  return (
    <section className="admin-metric-band" aria-label="Platform totals">
      {items.map((item) => {
        const Icon = item.icon;
        const healthy = "healthy" in item && item.healthy;
        return (
          <div
            className="admin-metric"
            id={"id" in item ? item.id : undefined}
            tabIndex={"id" in item ? -1 : undefined}
            key={item.label}
          >
            <span className="admin-metric__icon" aria-hidden="true">
              <Icon size={25} strokeWidth={1.8} />
            </span>
            <div>
              <span className="admin-metric__label admin-metric__label--desktop">
                {item.label}
              </span>
              <span className="admin-metric__label admin-metric__label--mobile">
                {item.mobileLabel}
              </span>
              <strong>
                {item.value}
                {healthy ? <i aria-label="Healthy" /> : null}
              </strong>
            </div>
          </div>
        );
      })}
    </section>
  );
}
