import {
  Boxes,
  Package,
  Store,
  StoreIcon,
  UserRoundPlus,
} from "lucide-react";
import type { AdminActivityItem } from "@/types/admin";
import { relativeAdminTime } from "./admin-shared";

function ActivityIcon({ kind }: { kind: AdminActivityItem["kind"] }) {
  const Icon =
    kind === "order"
      ? Package
      : kind === "product"
        ? Boxes
        : kind === "account"
          ? UserRoundPlus
          : kind === "vendor_created"
            ? StoreIcon
            : Store;
  return <Icon size={19} strokeWidth={1.8} />;
}

export function AdminActivityRail({
  items,
}: {
  items: readonly AdminActivityItem[];
}) {
  return (
    <aside className="admin-activity" aria-labelledby="admin-activity-title">
      <h2 id="admin-activity-title">Recent platform activity</h2>
      {items.length ? (
        <ol>
          {items.slice(0, 8).map((item) => (
            <li key={item.id}>
              <span className="admin-activity__icon" aria-hidden="true">
                <ActivityIcon kind={item.kind} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <time dateTime={item.createdAt} suppressHydrationWarning>
                {relativeAdminTime(item.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <div className="admin-activity__empty">
          <Store size={22} aria-hidden="true" />
          <p>Platform activity will appear here.</p>
        </div>
      )}
    </aside>
  );
}
