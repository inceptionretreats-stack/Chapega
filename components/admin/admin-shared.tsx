import { Store, UserRound } from "lucide-react";
import type { AdminVendorStatus } from "@/types/admin";

export function AdminVendorStatus({ status }: { status: AdminVendorStatus }) {
  return (
    <span className={`admin-status admin-status--${status}`}>
      <i aria-hidden="true" />
      {status === "active" ? "Active" : "Suspended"}
    </span>
  );
}

export function VendorAvatar({
  name,
  compact = false,
}: {
  name: string;
  compact?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("en-IN"))
    .join("");

  return (
    <span
      className={`admin-vendor-avatar${compact ? " is-compact" : ""}`}
      aria-hidden="true"
    >
      {initials || <Store size={compact ? 17 : 21} />}
    </span>
  );
}

export function AdminAccountAvatar() {
  return (
    <span className="admin-account-avatar" aria-hidden="true">
      <UserRound size={19} />
    </span>
  );
}

export function relativeAdminTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
