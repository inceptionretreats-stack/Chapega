"use client";

import { Eye, EyeOff } from "lucide-react";

type PasswordToggleProps = Readonly<{
  /** Whether the password is currently shown as plain text. */
  visible: boolean;
  onToggle: () => void;
  /** id of the password input this button reveals. */
  controls: string;
  className: string;
  disabled?: boolean;
  iconSize?: number;
}>;

/**
 * Show/hide control for a password field. It keeps one accessible name and
 * reports its state with aria-pressed, and it stays mounted while toggling so
 * focus stays on it.
 */
export function PasswordToggle({
  visible,
  onToggle,
  controls,
  className,
  disabled = false,
  iconSize = 18,
}: PasswordToggleProps) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Show password"
      aria-pressed={visible}
      aria-controls={controls}
      onClick={onToggle}
      disabled={disabled}
    >
      {visible ? <EyeOff size={iconSize} aria-hidden="true" /> : <Eye size={iconSize} aria-hidden="true" />}
    </button>
  );
}
