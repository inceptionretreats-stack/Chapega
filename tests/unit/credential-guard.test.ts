import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateVendorDatabase: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => false,
  isSupabaseConfigurationAvailable: () => false,
}));
vi.mock("@/server/vendor/database", () => ({
  updateVendorDatabase: mocks.updateVendorDatabase,
  readVendorDatabase: vi.fn(),
  newAuditRecord: vi.fn(),
}));

import {
  ENV_EXAMPLE_PLACEHOLDER_PASSWORD,
  getVendorCredentialConfiguration,
  isRejectedLoginCredential,
} from "@/server/vendor/config";
import { authenticateVendorLogin } from "@/server/vendor/auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared login credential guard", () => {
  it("rejects the published preview pair whenever preview access is not allowed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_VENDOR_PREVIEW_LOGIN", "");
    expect(isRejectedLoginCredential("owner@chapega.com", "Chapega@2026")).toBe(true);
    expect(isRejectedLoginCredential(" OWNER@chapega.com ", "Chapega@2026")).toBe(true);
    expect(isRejectedLoginCredential("owner@chapega.com", "a-real-long-password")).toBe(false);

    vi.stubEnv("NODE_ENV", "development");
    expect(isRejectedLoginCredential("owner@chapega.com", "Chapega@2026")).toBe(false);
  });

  it("always rejects the .env.example placeholder password", () => {
    expect(ENV_EXAMPLE_PLACEHOLDER_PASSWORD).toBe("replace-with-a-long-unique-password");
    for (const environment of ["development", "production"]) {
      vi.stubEnv("NODE_ENV", environment);
      vi.stubEnv("ALLOW_VENDOR_PREVIEW_LOGIN", "true");
      expect(
        isRejectedLoginCredential("anyone@example.com", "replace-with-a-long-unique-password"),
      ).toBe(true);
    }
  });

  it("refuses to configure local credentials with the placeholder password", () => {
    vi.stubEnv("VENDOR_EMAIL", "owner@example.com");
    vi.stubEnv("VENDOR_PASSWORD", "replace-with-a-long-unique-password");

    expect(() => getVendorCredentialConfiguration()).toThrow(/placeholder/i);
  });

  it("rejects the placeholder at vendor sign-in without touching the database", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VENDOR_EMAIL", "");
    vi.stubEnv("VENDOR_PASSWORD", "");

    await expect(
      authenticateVendorLogin("owner@chapega.com", "replace-with-a-long-unique-password"),
    ).resolves.toBeNull();
    expect(mocks.updateVendorDatabase).not.toHaveBeenCalled();
  });
});

describe("scripts/rotate-vendor-password.ts", () => {
  it("refuses the .env.example placeholder before opening the data store", () => {
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
            VENDOR_PASSWORD: "replace-with-a-long-unique-password",
          },
          timeout: 60_000,
        },
      );

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(/placeholder/i);
      expect(existsSync(path.join(dataDirectory, "vendor-db.json"))).toBe(false);
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  }, 60_000);
});
