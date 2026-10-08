import { COMMON_PASSWORDS } from "@/server/security/common-passwords";

/**
 * Policy for NEW passwords (admin-issued temporary passwords, rotation),
 * following NIST SP 800-63B-4 for password-only authentication: at least 15
 * characters, long passphrases allowed, no composition rules, and a blocklist
 * of common, published and context-specific values. Sign-in still accepts
 * existing shorter passwords; they are simply never issued again.
 *
 * Deliberately free of `server-only` so CLI scripts can import it.
 */
export const NEW_PASSWORD_MIN_LENGTH = 15;
export const NEW_PASSWORD_MAX_LENGTH = 128;

/** Published values that must never become a real password. */
const PUBLISHED_PASSWORDS = [
  "Chapega@2026",
  "replace-with-a-long-unique-password",
];

export type PasswordContext = Readonly<{
  email?: string;
  name?: string;
}>;

function characterCount(value: string): number {
  return Array.from(value).length;
}

/** Lower case, letters and digits only (so "Pass word!" ≈ "password"). */
function normalized(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]/gu, "");
}

function isCommon(value: string): boolean {
  const compact = normalized(value);
  if (COMMON_PASSWORDS.has(compact)) return true;
  // "passwordpassword2026!" is no stronger than "passwordpassword".
  const withoutTrailingDigits = compact.replace(/\d+$/, "");
  const withoutLeadingDigits = compact.replace(/^\d+/, "");
  return (
    COMMON_PASSWORDS.has(withoutTrailingDigits) ||
    COMMON_PASSWORDS.has(withoutLeadingDigits)
  );
}

function isTriviallyPatterned(value: string): boolean {
  const compact = value.toLocaleLowerCase("en-US");
  if (new Set(Array.from(compact)).size < 5) return true;
  // The whole password is one chunk repeated: "abcabcabc…", "ChapegaChapega".
  if (/^([\s\S]+?)\1+$/u.test(compact)) return true;
  const letters = normalized(value);
  return letters.length >= 4 && /^(.+?)\1+$/u.test(letters);
}

function containsPublishedPassword(value: string): boolean {
  const lower = value.toLocaleLowerCase("en-US");
  return PUBLISHED_PASSWORDS.some((published) =>
    lower.includes(published.toLocaleLowerCase("en-US")),
  );
}

function reusesContext(value: string, context: PasswordContext): boolean {
  const lower = value.toLocaleLowerCase("en-US");
  const email = context.email?.trim().toLocaleLowerCase("en-US");
  if (email) {
    if (lower.includes(email)) return true;
    const local = email.split("@", 1)[0] ?? "";
    if (local.length >= 4 && normalized(value).startsWith(normalized(local))) {
      const rest = normalized(value).slice(normalized(local).length);
      if (rest.length < 8) return true;
    }
  }
  const name = context.name ? normalized(context.name) : "";
  if (name.length >= 4) {
    const compact = normalized(value);
    if (compact.startsWith(name) && compact.length - name.length < 8) return true;
  }
  return false;
}

/** Why a new password is unacceptable, or null when it is fine. */
export function newPasswordProblem(
  password: string,
  context: PasswordContext = {},
): string | null {
  const length = characterCount(password);
  if (length < NEW_PASSWORD_MIN_LENGTH) {
    return `Use at least ${NEW_PASSWORD_MIN_LENGTH} characters. A few unrelated words make a good passphrase.`;
  }
  if (length > NEW_PASSWORD_MAX_LENGTH) {
    return `Use at most ${NEW_PASSWORD_MAX_LENGTH} characters.`;
  }
  if (containsPublishedPassword(password)) {
    return "This password is published and cannot be used.";
  }
  if (isCommon(password) || isTriviallyPatterned(password)) {
    return "This password is too common or predictable. Choose a less guessable passphrase.";
  }
  if (reusesContext(password, context)) {
    return "Do not base the password on the account email or name.";
  }
  return null;
}
