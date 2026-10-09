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
    },
    {
      label: "Active stores",
      mobileLabel: "Active",
      value: metrics.activeVendors,
      healthy: true,
    },
    {
      label: "Orders",
      mobileLabel: "Orders",
      value: metrics.orderCount,
      id: "admin-orders-summary",
    },
    {
      label: "Products",
      mobileLabel: "Products",
      value: metrics.productCount,
    },
  ] as const;

  // A plain row of label and value pairs: no icons, no card per metric.
  return (
    <section className="admin-metric-band" aria-label="Platform totals">
      {items.map((item) => {
        const healthy = "healthy" in item && item.healthy;
        return (
          <div
            className="admin-metric"
            id={"id" in item ? item.id : undefined}
            tabIndex={"id" in item ? -1 : undefined}
            key={item.label}
          >
            <div>
              <span className="admin-metric__label admin-metric__label--desktop">{item.label}</span>
              <span className="admin-metric__label admin-metric__label--mobile">
                {item.mobileLabel}
              </span>
              <strong>
                {item.value}
                {healthy ? <i role="img" aria-label="Healthy" /> : null}
              </strong>
            </div>
          </div>
        );
      })}
    </section>
  );
}
