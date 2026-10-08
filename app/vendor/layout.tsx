import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeRoot } from "@/components/theme-root";
import { resolveThemeChoice, THEME_COOKIE } from "@/domain/theme";
import "./vendor.css";

export const metadata: Metadata = {
  title: "Vendor Studio · Chapega.com",
  description: "Manage Chapega.com products, stock, orders, and kiosk settings.",
  robots: { index: false, follow: false },
};

// Reading the theme cookie keeps this layout dynamic; every studio page is
// session-protected and already rendered per request.
export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const theme = resolveThemeChoice((await cookies()).get(THEME_COOKIE)?.value);
  return <ThemeRoot className="vendor-route" initialTheme={theme}>{children}</ThemeRoot>;
}
