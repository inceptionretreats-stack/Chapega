import type { AssignableTeamRole, VendorRole } from "@/types/vendor";

export const ASSIGNABLE_TEAM_ROLES: readonly AssignableTeamRole[] = ["manager", "staff"];

export const TEAM_ROLE_LABELS: Readonly<Record<VendorRole, string>> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

/** What each role can do; mirrors capabilitiesForVendorRole (server/vendor/auth.ts). */
export const TEAM_ROLE_SUMMARIES: Readonly<Record<VendorRole, string>> = {
  owner: "Everything, including shop settings and the team.",
  manager: "Orders and products. Can remove a customer's details on request.",
  staff: "Orders only.",
};

// No look-alikes (0/o, 1/l/i), so a password read aloud or copied by hand works.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 4;
const GROUP_LENGTH = 5;

/**
 * A random temporary password such as "k7mqp-2xwhe-9tzrd-c4nfa" (20 random
 * characters, about 99 bits). The person replaces it at their first sign-in.
 */
export function generateTemporaryPassword(
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const characters: string[] = [];
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % ALPHABET.length);
  while (characters.length < GROUPS * GROUP_LENGTH) {
    for (const byte of random(new Uint8Array(32))) {
      if (byte < limit && characters.length < GROUPS * GROUP_LENGTH) {
        characters.push(ALPHABET[byte % ALPHABET.length]);
      }
    }
  }
  const groups: string[] = [];
  for (let index = 0; index < GROUPS; index += 1) {
    groups.push(characters.slice(index * GROUP_LENGTH, (index + 1) * GROUP_LENGTH).join(""));
  }
  return groups.join("-");
}
