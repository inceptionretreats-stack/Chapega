import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Platform Admin · Chapega.com",
  description: "Private multi-vendor operations for the Chapega.com platform.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="admin-route">{children}</div>;
}
