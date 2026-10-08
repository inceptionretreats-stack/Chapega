"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId } from "react";
import type { ThemeChoice } from "@/domain/theme";
import { useThemeChoice } from "./theme-root";

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** System / Light / Dark choice for Vendor Studio and admin (native radios). */
export function ThemeControl({ className }: Readonly<{ className?: string }>) {
  const { theme, setTheme } = useThemeChoice();
  const id = useId();
  return (
    <div className={`theme-control${className ? ` ${className}` : ""}`} role="radiogroup" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="theme-control__label">Theme</span>
      <div className="theme-control__options">
        {OPTIONS.map(({ value, label, Icon }) => (
          <label key={value} className={`theme-control__option${theme === value ? " is-selected" : ""}`}>
            <input
              type="radio"
              name={`${id}-theme`}
              value={value}
              checked={theme === value}
              onChange={() => setTheme(value)}
            />
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
