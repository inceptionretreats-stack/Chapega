import { scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DUMMY_PASSWORD_HASH,
  DUMMY_PASSWORD_SALT,
  derivePasswordHash,
  passwordHashNeedsRehash,
  verifyPassword,
} from "@/server/vendor/crypto";

/** A hash exactly as the previous implementation stored it (N=2^14, raw base64). */
function legacyHash(password: string, salt: string): string {
  return scryptSync(password, Buffer.from(salt, "base64"), 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("base64");
}

describe("password storage", () => {
  it("derives new hashes with OWASP scrypt parameters recorded in the hash", async () => {
    const { salt, hash } = await derivePasswordHash("a long and unique passphrase");

    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(hash).toMatch(/^scrypt\$N=131072,r=8,p=1\$[A-Za-z0-9+/]+=*$/);
    expect(hash.length).toBeLessThanOrEqual(512);
    await expect(verifyPassword("a long and unique passphrase", salt, hash)).resolves.toBe(true);
    await expect(verifyPassword("a long and unique passphrasE", salt, hash)).resolves.toBe(false);
    expect(passwordHashNeedsRehash(hash)).toBe(false);
  });

  it("still verifies hashes written with the previous parameters and flags them for rehash", async () => {
    const salt = Buffer.alloc(16, 7).toString("base64");
    const stored = legacyHash("Chapega-legacy-password", salt);

    await expect(verifyPassword("Chapega-legacy-password", salt, stored)).resolves.toBe(true);
    await expect(verifyPassword("wrong", salt, stored)).resolves.toBe(false);
    expect(passwordHashNeedsRehash(stored)).toBe(true);
  });

  it("refuses unparseable or abusive parameters instead of hashing with them", async () => {
    const salt = Buffer.alloc(16, 1).toString("base64");
    for (const stored of [
      "scrypt$N=1073741824,r=8,p=1$AAAA",
      "scrypt$N=131071,r=8,p=1$AAAA",
      "scrypt$N=131072,r=64,p=1$AAAA",
      "scrypt$garbage",
      "",
    ]) {
      await expect(verifyPassword("x", salt, stored)).resolves.toBe(false);
      expect(passwordHashNeedsRehash(stored)).toBe(true);
    }
  });

  it("ships a dummy credential with current parameters for timing equalization", async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^scrypt\$N=131072,r=8,p=1\$/);
    expect(Buffer.from(DUMMY_PASSWORD_SALT, "base64")).toHaveLength(16);
    await expect(
      verifyPassword("anything", DUMMY_PASSWORD_SALT, DUMMY_PASSWORD_HASH),
    ).resolves.toBe(false);
  });

  it("handles concurrent derivations without exceeding scrypt's memory limit", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) => derivePasswordHash(`passphrase number ${index}`)),
    );
    expect(results.every((result) => result.hash.startsWith("scrypt$"))).toBe(true);
  }, 30_000);
});

describe("supabase migration for own-password rehash", () => {
  it("adds a narrow security-definer function bound to app.user_id", async () => {
    const sql = await readFile(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20261008130000_auth_hardening.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("create function private.rehash_own_password(");
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toContain("current_setting('app.user_id', true)");
    expect(sql).toContain("password_hash = p_expected_hash");
    expect(sql).toMatch(/revoke all on function private\.rehash_own_password\([^)]*\)\s+from public/);
    expect(sql).toMatch(/grant execute on function private\.rehash_own_password\([^)]*\)\s+to chapega_app/);
  });
});
