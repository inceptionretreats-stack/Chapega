import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { VendorDatabase } from "@/server/vendor/database";

const memory = vi.hoisted(() => ({ database: null as unknown, writes: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/server/supabase/config", () => ({
  usesSupabaseBackend: () => false,
  isSupabaseConfigurationAvailable: () => false,
}));
vi.mock("@/server/vendor/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/vendor/crypto")>()),
  verifyPassword: async (password: string) => password === "correct password here",
  passwordHashNeedsRehash: () => false,
  randomToken: () => "session-token",
}));
vi.mock("@/server/vendor/database", () => {
  const read = async () => structuredClone(memory.database);
  const update = async <T>(mutation: (database: VendorDatabase) => T | Promise<T>) => {
    const draft = structuredClone(memory.database) as VendorDatabase;
    const result = await mutation(draft);
    memory.database = draft;
    memory.writes += 1;
    return structuredClone(result);
  };
  return {
    newAuditRecord: (actorId: string, action: string) => ({
      id: `audit-${Math.random()}`,
      actorId,
      action,
      entityType: "auth",
      entityId: actorId,
      vendorId: null,
      createdAt: new Date().toISOString(),
    }),
    readVendorDatabase: read,
    updateVendorDatabase: update,
    readLocalVendorDatabase: read,
    updateLocalVendorDatabase: update,
  };
});

import {
  authenticateVendorLogin,
  getRequestVendorUser,
  getVendorUserByToken,
} from "@/server/vendor/auth";
import { authenticateAdminLogin, getAdminByToken, getRequestAdmin } from "@/server/admin/auth";
import { backgroundRefreshHeaders } from "@/domain/session-activity";

const vendorId = "00000000-0000-4000-8000-000000000001";
const userId = "11111111-1111-4111-8111-111111111111";
const MINUTE = 60_000;
let now = Date.parse("2026-10-08T08:00:00.000Z");

function advance(minutes: number) {
  now += minutes * MINUTE;
  vi.setSystemTime(now);
}

function database(): VendorDatabase {
  return {
    version: 2,
    revision: 1,
    vendors: [
      {
        id: vendorId,
        slug: "chapega",
        displayName: "Chapega.com",
        status: "active",
        revision: 1,
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    users: [
      {
        id: userId,
        email: "owner@example.com",
        name: "Owner",
        platformRole: "super_admin",
        passwordSalt: "salt",
        passwordHash: "scrypt$N=131072,r=8,p=1$x",
        active: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    memberships: [
      {
        vendorId,
        userId,
        role: "owner",
        active: true,
        isDefault: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
    sessions: [],
    products: [],
    orders: [],
    settings: [],
    audit: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  now = Date.parse("2026-10-08T08:00:00.000Z");
  vi.setSystemTime(now);
  memory.database = database();
  memory.writes = 0;
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VENDOR_EMAIL", "");
  vi.stubEnv("VENDOR_PASSWORD", "");
  vi.stubEnv("VENDOR_SESSION_HOURS", "");
  vi.stubEnv("VENDOR_SESSION_IDLE_MINUTES", "");
  vi.stubEnv("ADMIN_SESSION_HOURS", "");
  vi.stubEnv("ADMIN_SESSION_IDLE_MINUTES", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("vendor session idle timeout (local adapter)", () => {
  it("ends a session after 30 idle minutes even within the 12 h lifetime", async () => {
    const login = await authenticateVendorLogin("owner@example.com", "correct password here");
    expect(login).not.toBeNull();
    expect(login!.expiresAt.getTime()).toBe(now + 30 * MINUTE);

    advance(29);
    await expect(getVendorUserByToken("session-token")).resolves.not.toBeNull();
    advance(31);
    await expect(getVendorUserByToken("session-token")).resolves.toBeNull();
  });

  it("slides with activity but never beyond the absolute lifetime", async () => {
    await authenticateVendorLogin("owner@example.com", "correct password here");

    // Active every 20 minutes for almost 12 hours: never idle-expired.
    for (let elapsed = 20; elapsed < 12 * 60; elapsed += 20) {
      advance(20);
      await expect(getVendorUserByToken("session-token"), `t+${elapsed}m`).resolves.not.toBeNull();
    }
    advance(20); // 12 h 0 m after sign-in
    await expect(getVendorUserByToken("session-token")).resolves.toBeNull();
  });

  it("refreshes the stored expiry at most about once a minute", async () => {
    await authenticateVendorLogin("owner@example.com", "correct password here");
    const writesAfterLogin = memory.writes;

    for (let index = 0; index < 10; index += 1) {
      await getVendorUserByToken("session-token");
    }
    expect(memory.writes).toBe(writesAfterLogin);

    advance(5);
    await getVendorUserByToken("session-token");
    expect(memory.writes).toBe(writesAfterLogin + 1);
  });

  it("honours VENDOR_SESSION_IDLE_MINUTES", async () => {
    vi.stubEnv("VENDOR_SESSION_IDLE_MINUTES", "10");
    await authenticateVendorLogin("owner@example.com", "correct password here");

    advance(11);
    await expect(getVendorUserByToken("session-token")).resolves.toBeNull();
  });
});

describe("platform admin session idle timeout (local adapter)", () => {
  it("ends an admin session after 15 idle minutes and caps it at 8 hours", async () => {
    const login = await authenticateAdminLogin("owner@example.com", "correct password here");
    expect(login).not.toBeNull();

    advance(14);
    await expect(getAdminByToken("session-token")).resolves.not.toBeNull();
    advance(16);
    await expect(getAdminByToken("session-token")).resolves.toBeNull();

    memory.database = database();
    await authenticateAdminLogin("owner@example.com", "correct password here");
    for (let elapsed = 10; elapsed < 8 * 60; elapsed += 10) {
      advance(10);
      await expect(getAdminByToken("session-token")).resolves.not.toBeNull();
    }
    advance(10);
    await expect(getAdminByToken("session-token")).resolves.toBeNull();
  });
});

describe("background refreshes are not activity (AUD-17)", () => {
  function request(path: string, cookie: string, background: boolean) {
    return new NextRequest(`http://localhost${path}`, {
      headers: {
        cookie: `${cookie}=session-token`,
        ...(background ? backgroundRefreshHeaders : {}),
      },
    });
  }

  it("lets a Studio tab that only polls reach its idle timeout", async () => {
    await authenticateVendorLogin("owner@example.com", "correct password here");
    const poll = () =>
      getRequestVendorUser(request("/api/vendor/bootstrap", "chapega_vendor_session", true));

    // The portal polls every 30 s while visible; nobody touches it.
    for (let elapsed = 1; elapsed < 30; elapsed += 1) {
      advance(1);
      await expect(poll(), `t+${elapsed}m`).resolves.not.toBeNull();
    }
    advance(1);
    await expect(poll()).resolves.toBeNull();
  });

  it("still slides on a real request between polls", async () => {
    await authenticateVendorLogin("owner@example.com", "correct password here");
    advance(20);
    await expect(
      getRequestVendorUser(request("/api/vendor/products", "chapega_vendor_session", false)),
    ).resolves.not.toBeNull();

    advance(25); // 45 min after sign-in, 25 after the last real request
    await expect(
      getRequestVendorUser(request("/api/vendor/bootstrap", "chapega_vendor_session", true)),
    ).resolves.not.toBeNull();
    advance(6);
    await expect(
      getRequestVendorUser(request("/api/vendor/bootstrap", "chapega_vendor_session", true)),
    ).resolves.toBeNull();
  });

  it("lets an admin tab that only polls reach its idle timeout", async () => {
    await authenticateAdminLogin("owner@example.com", "correct password here");
    const poll = () =>
      getRequestAdmin(request("/api/admin/bootstrap", "chapega_admin_session", true));

    advance(14);
    await expect(poll()).resolves.not.toBeNull();
    advance(2);
    await expect(poll()).resolves.toBeNull();
  });
});

describe("session cookies", () => {
  it("are browser-session cookies (no persistent Expires/Max-Age)", async () => {
    vi.resetModules();
    vi.doMock("@/server/vendor/auth", () => ({
      VENDOR_SESSION_COOKIE: "chapega_vendor_session",
      authenticateVendorLogin: async () => ({
        user: { id: userId },
        token: "cookie-token",
        expiresAt: new Date(now + 30 * MINUTE),
      }),
      getRequestVendorContext: vi.fn(),
    }));
    const { POST } = await import("@/app/api/vendor/login/route");

    const response = await POST(
      new NextRequest("http://localhost/api/vendor/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ email: "owner@example.com", password: "correct password here" }),
      }),
    );

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("chapega_vendor_session=cookie-token");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Expires=|Max-Age=/i);
    vi.doUnmock("@/server/vendor/auth");
  });
});

describe("supabase migration for session refresh", () => {
  it("allows updating only the caller's own live session row", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "supabase", "migrations", "20261008130000_auth_hardening.sql"),
      "utf8",
    );
    const policy = /create policy chapega_sessions_refresh[\s\S]*?;/.exec(sql)?.[0] ?? "";

    expect(policy).toContain("on private.vendor_sessions");
    expect(policy).toContain("for update");
    expect(policy).toContain("to chapega_app");
    expect(policy).toContain("id_hash = nullif(current_setting('app.session_hash', true), '')");
    expect(policy).toMatch(
      /with check \([\s\S]*id_hash = nullif\(current_setting\('app\.session_hash', true\), ''\)/,
    );
  });
});
