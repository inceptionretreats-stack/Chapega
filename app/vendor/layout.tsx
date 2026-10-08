import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ThemeRoot } from "@/components/theme-root";
import { resolveThemeChoice, THEMEABLE_VIEWPORT, THEME_COOKIE } from "@/domain/theme";
import "./vendor.css";

export const metadata: Metadata = {
  title: "Vendor Studio · Chapega.com",
  description: "Manage Chapega.com products, stock, orders, and kiosk settings.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  ...THEMEABLE_VIEWPORT,
  themeColor: [...THEMEABLE_VIEWPORT.themeColor],
};

// Reading the theme cookie keeps this layout dynamic; every studio page is
// session-protected and already rendered per request.
export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const theme = resolveThemeChoice((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <ThemeRoot className="vendor-route" initialTheme={theme}>
      {children}
    </ThemeRoot>
  );
}
