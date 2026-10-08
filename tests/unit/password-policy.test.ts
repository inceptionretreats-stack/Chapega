import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  newPasswordProblem,
} from "@/server/security/password-policy";
import { createAdminVendorSchema } from "@/server/admin/schemas";

const vendor = {
  displayName: "Petal House",
  slug: "petal-house",
  ownerName: "Mira Owner",
  ownerEmail: "mira@example.com",
  ownerWhatsAppNumber: "+91 98765 43210",
};

describe("new password policy (NIST SP 800-63B-4)", () => {
  it("requires 15 to 128 characters", () => {
    expect(NEW_PASSWORD_MIN_LENGTH).toBe(15);
    expect(NEW_PASSWORD_MAX_LENGTH).toBe(128);
    expect(newPasswordProblem("fourteen chars")).toMatch(/15/);
    expect(newPasswordProblem("fifteen chars!!")).toBeNull();
    const sentence =
      "Seven amber lanterns drift past the old harbour wall while gulls argue about breakfast";
    const longest = sentence.padEnd(128, ".");
    expect(longest).toHaveLength(128);
    expect(newPasswordProblem(longest)).toBeNull();
    expect(newPasswordProblem(`${longest}!`)).toMatch(/128/);
  });

  it("has no composition rules", () => {
    expect(newPasswordProblem("marigold teapot on a windowsill")).toBeNull();
    expect(newPasswordProblem("MARIGOLDTEAPOTWINDOW")).toBeNull();
  });

  it("rejects common, published and trivially patterned passwords", () => {
    for (const password of [
      "passwordpassword",
      "Password12345678!",
      "qwertyuiopasdfgh",
      "correcthorsebatterystaple",
      "Correct Horse Battery Staple",
      "123456789012345",
      "aaaaaaaaaaaaaaaaaaaa",
      "abcabcabcabcabcabc",
      "replace-with-a-long-unique-password",
      "Chapega@2026Chapega@2026",
    ]) {
      expect(newPasswordProblem(password), password).not.toBeNull();
    }
  });

  it("rejects passwords built from the account email", () => {
    expect(
      newPasswordProblem("mira@example.com2026", { email: "mira@example.com" }),
    ).not.toBeNull();
    expect(newPasswordProblem("MIRA@EXAMPLE.COM", { email: "mira@example.com" })).not.toBeNull();
  });
});

describe("admin create-vendor temporary password", () => {
  it("accepts a long passphrase without upper case or digits", () => {
    expect(
      createAdminVendorSchema.safeParse({
        ...vendor,
        temporaryPassword: "lantern over the quiet harbour",
      }).success,
    ).toBe(true);
  });

  it("explains why a short or common password is refused", () => {
    const short = createAdminVendorSchema.safeParse({
      ...vendor,
      temporaryPassword: "TemporaryPass1",
    });
    expect(short.success).toBe(false);
    expect(JSON.stringify(short.error?.flatten().fieldErrors.temporaryPassword)).toMatch(/15/);

    const common = createAdminVendorSchema.safeParse({
      ...vendor,
      temporaryPassword: "passwordpassword1",
    });
    expect(common.success).toBe(false);
    expect(common.error?.flatten().fieldErrors.temporaryPassword?.length).toBeGreaterThan(0);
  });
});

describe("scripts/rotate-vendor-password.ts", () => {
  function rotate(password: string) {
    const dataDirectory = mkdtempSync(path.join(tmpdir(), "chapega-rotate-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "scripts/rotate-vendor-password.ts",
          "--confirm-rotation",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            NODE_ENV: "development",
            CHAPEGA_DATA_BACKEND: "local",
            CHAPEGA_DATA_DIR: dataDirectory,
            VENDOR_EMAIL: "owner@example.com",
            VENDOR_PASSWORD: password,
          },
          timeout: 60_000,
        },
      );
      return {
        status: result.status,
        output: `${result.stdout}${result.stderr}`,
        createdStore: existsSync(path.join(dataDirectory, "vendor-db.json")),
      };
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  }

  it("refuses passwords that fail the new-password policy before opening the store", () => {
    for (const password of ["Sh0rt-but-12", "passwordpassword1"]) {
      const result = rotate(password);
      expect(result.status, password).not.toBe(0);
      expect(result.output).toMatch(/15|common/i);
      expect(result.createdStore).toBe(false);
    }
  }, 60_000);
});
