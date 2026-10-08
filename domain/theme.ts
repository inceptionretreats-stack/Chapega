/** Colour theme preference for Vendor Studio and the platform admin. */
export const THEME_COOKIE = "chapega-theme";

export const THEME_CHOICES = ["system", "light", "dark"] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** A stored value is used only if it is exactly one of the choices; anything else follows the system. */
export function resolveThemeChoice(value: string | null | undefined): ThemeChoice {
  return (THEME_CHOICES as readonly string[]).includes(value ?? "")
    ? (value as ThemeChoice)
    : "system";
}

/**
 * document.cookie string for a choice. It is a display preference, not a
 * secret, so it is readable by the page; Lax keeps it on normal navigation.
 */
export function themeCookieString(choice: ThemeChoice, secure: boolean): string {
  return `${THEME_COOKIE}=${choice}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * Viewport hints for the themeable surfaces (Vendor Studio and admin): both
 * schemes are supported, so a dark system gets a dark canvas before CSS loads.
 * The public kiosk keeps the root layout's light-only viewport.
 */
export const THEMEABLE_VIEWPORT = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff9f2" },
    { media: "(prefers-color-scheme: dark)", color: "#231a1f" },
  ],
} as const;
