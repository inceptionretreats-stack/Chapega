import type { Metadata } from "next";
import "./vendor.css";

export const metadata: Metadata = {
  title: "Vendor Studio · Chapega.com",
  description: "Manage Chapega.com products, stock, orders, and kiosk settings.",
  robots: { index: false, follow: false },
};

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <div className="vendor-route">{children}</div>;
}
