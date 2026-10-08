import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ThemeRoot } from "@/components/theme-root";
import { resolveThemeChoice, THEMEABLE_VIEWPORT, THEME_COOKIE } from "@/domain/theme";
import "./admin.css";

export const metadata: Metadata = {
  title: "Platform Admin · Chapega.com",
  description: "Private multi-vendor operations for the Chapega.com platform.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  ...THEMEABLE_VIEWPORT,
  themeColor: [...THEMEABLE_VIEWPORT.themeColor],
};

// Reading the theme cookie keeps this layout dynamic; every admin page is
// session-protected and already rendered per request.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const theme = resolveThemeChoice((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <ThemeRoot className="admin-route" initialTheme={theme}>
      {children}
    </ThemeRoot>
  );
}
