"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { themeCookieString, type ThemeChoice } from "@/domain/theme";

type ThemeContextValue = Readonly<{
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
}>;

function persist(theme: ThemeChoice) {
  document.cookie = themeCookieString(theme, window.location.protocol === "https:");
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: persist,
});

export function useThemeChoice(): ThemeContextValue {
  return use(ThemeContext);
}

type ThemeRootProps = Readonly<{
  className: string;
  /** Read from the cookie on the server, so the first HTML already has it. */
  initialTheme: ThemeChoice;
  children?: ReactNode;
}>;

/**
 * Route wrapper that carries data-theme. The stylesheet re-themes the whole
 * document from it (:root:has([data-theme])), so no inline script is needed
 * and there is no flash on load.
 */
export function ThemeRoot({ className, initialTheme, children }: ThemeRootProps) {
  const [theme, setThemeState] = useState<ThemeChoice>(initialTheme);
  const setTheme = (next: ThemeChoice) => {
    persist(next);
    setThemeState(next);
  };
  return (
    <ThemeContext value={{ theme, setTheme }}>
      <div className={className} data-theme={theme}>
        {children}
      </div>
    </ThemeContext>
  );
}
