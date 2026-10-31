import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { VendorDatabase } from "@/server/vendor/database";

const memory = vi.hoisted(() => ({ database: null as unknown, tokens: 0 }));

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
  randomToken: () => `tok${++memory.tokens}`.padEnd(43, "B"),
}));
vi.mock("@/server/vendor/database", () => {
  const read = async () => structuredClone(memory.database);
  const update = async <T>(mutation: (database: VendorDatabase) => T | Promise<T>) => {
    const draft = structuredClone(memory.database) as VendorDatabase;
    const result = await mutation(draft);
    memory.database = draft;
    return structuredClone(result);
  };
  return {
    DEFAULT_VENDOR_SLUG: "chapega",
    isVendorSessionScope: (scope: string) => scope === "vendor" || scope === "vendor_app",
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

import { POST as appLogin } from "@/app/api/studio-app/v1/login/route";
import { POST as appLogout } from "@/app/api/studio-app/v1/logout/route";
import { GET as appSession } from "@/app/api/studio-app/v1/session/route";
import {
  DELETE as forgetPush,
  PUT as registerPush,
} from "@/app/api/studio-app/v1/push-token/route";
import { POST as studioLogin } from "@/app/api/vendor/login/route";
import { setLogSink } from "@/server/observability/logger";
import { clearMemoryRateLimits } from "@/server/vendor/rate-limit";
import { sha256 } from "@/server/vendor/crypto";

const vendorId = "00000000-0000-4000-8000-000000000001";
const PASSWORD = "correct password here";
const install = "0f8fad5b-d9cb-469f-a165-70867728950e";
// Shaped like a real FCM registration token, built at run time.
const fcmToken = (seed: string) => `${seed}:APA91b${"x".repeat(140)}`;

function database(): VendorDatabase {
  const user = (id: string, email: string) => ({
    id,
    email,
    name: email.split("@")[0],
    platformRole: null,
    passwordSalt: "salt",
    passwordHash: "scrypt$N=131072,r=8,p=1$x",
    active: true,
    createdAt: "2026-09-18T00:00:00.000Z",
  });
  const membership = (userId: string, role: "owner" | "staff") => ({
    vendorId,
    userId,
    role,
    active: true,
    isDefault: true,
    createdAt: "2026-09-18T00:00:00.000Z",
  });
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
      user("11111111-1111-4111-8111-111111111111", "owner@example.com"),
      user("22222222-2222-4222-8222-222222222222", "staff@example.com"),
    ],
    memberships: [
      membership("11111111-1111-4111-8111-111111111111", "owner"),
      membership("22222222-2222-4222-8222-222222222222", "staff"),
    ],
    sessions: [],
    products: [],
    orders: [],
    settings: [],
    audit: [],
  };
}

function json(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function loginBody(email = "owner@example.com", password = PASSWORD) {
  return {
    email,
    password,
    device: {
      installationId: install,
      platform: "android",
      model: "Pixel 8",
      appVersion: "1.0.0+1",
    },
  };
}

async function signIn(email = "owner@example.com") {
  const response = await appLogin(json("/api/studio-app/v1/login", "POST", loginBody(email)));
  expect(response.status).toBe(200);
  return (await response.json()) as { token: string };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  memory.database = database();
  memory.tokens = 0;
  clearMemoryRateLimits();
  setLogSink(() => {});
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VENDOR_EMAIL", "");
  vi.stubEnv("VENDOR_PASSWORD", "");
  vi.stubEnv("FCM_SERVICE_ACCOUNT_JSON", "");
});

afterEach(() => {
  setLogSink(null);
  vi.unstubAllEnvs();
});

describe("POST /api/studio-app/v1/login", () => {
  it("returns the token once, in the body, and never as a cookie", async () => {
    const response = await appLogin(json("/api/studio-app/v1/login", "POST", loginBody()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      tokenType: "Bearer",
      signedOutDevices: 0,
      user: { email: "owner@example.com", role: "owner", activeVendor: { slug: "chapega" } },
    });
    expect(body.token).toMatch(/^chapega_app_[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(body.expiresAt)).toBeLessThan(Date.parse(body.absoluteExpiresAt));
  });

  it("answers an unknown email exactly like a wrong password", async () => {
    const wrong = await appLogin(
      json(
        "/api/studio-app/v1/login",
        "POST",
        loginBody("owner@example.com", "wrong password here"),
      ),
    );
    const unknown = await appLogin(
      json(
        "/api/studio-app/v1/login",
        "POST",
        loginBody("nobody@example.com", "wrong password here"),
      ),
    );

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("needs the device it signs in", async () => {
    const response = await appLogin(
      json("/api/studio-app/v1/login", "POST", { email: "owner@example.com", password: PASSWORD }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("shares the Studio's sign-in limits, so a second door gives no extra guesses", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await studioLogin(
        json("/api/vendor/login", "POST", {
          email: "owner@example.com",
          password: "wrong password here",
        }),
      );
      expect(response.status).toBe(401);
    }

    const response = await appLogin(json("/api/studio-app/v1/login", "POST", loginBody()));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("GET /api/studio-app/v1/session", () => {
  it("describes the signed-in person for a Bearer token only", async () => {
    const { token } = await signIn();

    const response = await appSession(
      json("/api/studio-app/v1/session", "GET", undefined, bearer(token)),
    );
    const cookieOnly = await appSession(
      json("/api/studio-app/v1/session", "GET", undefined, {
        cookie: `chapega_vendor_session=${token}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { email: "owner@example.com" },
      push: { serverEnabled: false },
    });
    expect(cookieOnly.status).toBe(401);
  });
});

describe("POST /api/studio-app/v1/logout", () => {
  it("ends the session, and saying it again is harmless", async () => {
    const { token } = await signIn();

    const first = await appLogout(
      json("/api/studio-app/v1/logout", "POST", undefined, bearer(token)),
    );
    const again = await appLogout(
      json("/api/studio-app/v1/logout", "POST", undefined, bearer(token)),
    );
    const after = await appSession(
      json("/api/studio-app/v1/session", "GET", undefined, bearer(token)),
    );

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(after.status).toBe(401);
  });

  it("needs a Bearer token", async () => {
    const response = await appLogout(json("/api/studio-app/v1/logout", "POST"));
    expect(response.status).toBe(401);
  });
});

describe("/api/studio-app/v1/push-token", () => {
  function storedPush(token: string) {
    const session = (memory.database as VendorDatabase).sessions.find(
      (candidate) => candidate.idHash === sha256(token),
    );
    return session?.push?.token;
  }

  it("registers this phone's token and forgets it again", async () => {
    const { token } = await signIn();

    const registered = await registerPush(
      json("/api/studio-app/v1/push-token", "PUT", { fcmToken: fcmToken("one") }, bearer(token)),
    );
    expect(registered.status).toBe(200);
    expect(await registered.json()).toEqual({ registered: true, serverEnabled: false });
    expect(storedPush(token)).toBe(fcmToken("one"));

    const forgotten = await forgetPush(
      json("/api/studio-app/v1/push-token", "DELETE", undefined, bearer(token)),
    );
    expect(forgotten.status).toBe(200);
    expect(storedPush(token)).toBeUndefined();
  });

  it("gives a shared phone's token to whoever registered it last", async () => {
    const owner = await signIn("owner@example.com");
    const staff = await signIn("staff@example.com");
    const shared = fcmToken("shared");

    await registerPush(
      json("/api/studio-app/v1/push-token", "PUT", { fcmToken: shared }, bearer(owner.token)),
    );
    await registerPush(
      json("/api/studio-app/v1/push-token", "PUT", { fcmToken: shared }, bearer(staff.token)),
    );

    expect(storedPush(owner.token)).toBeUndefined();
    expect(storedPush(staff.token)).toBe(shared);
  });

  it("refuses malformed tokens, missing sign-in, and too many changes", async () => {
    const { token } = await signIn();

    const malformed = await registerPush(
      json("/api/studio-app/v1/push-token", "PUT", { fcmToken: "short" }, bearer(token)),
    );
    const anonymous = await registerPush(
      json("/api/studio-app/v1/push-token", "PUT", { fcmToken: fcmToken("one") }),
    );
    expect(malformed.status).toBe(400);
    expect(anonymous.status).toBe(401);

    let last = 0;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await registerPush(
        json(
          "/api/studio-app/v1/push-token",
          "PUT",
          { fcmToken: fcmToken(`n${attempt}`) },
          bearer(token),
        ),
      );
      last = response.status;
    }
    expect(last).toBe(429);
  });
});
