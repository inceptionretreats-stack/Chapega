import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { VendorDatabase, VendorSessionRecord } from "@/server/vendor/database";

const memory = vi.hoisted(() => ({ database: null as unknown, writes: 0, tokens: 0 }));

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
  // 43 base64url characters, like randomToken(32), and different every time.
  randomToken: () => `tok${++memory.tokens}`.padEnd(43, "A"),
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

import {
  authenticateVendorAppLogin,
  authenticateVendorLogin,
  getRequestVendorUser,
  getVendorSessionByToken,
  vendorAccessContextFromUser,
  vendorAppDeviceHash,
} from "@/server/vendor/auth";
import { changeOwnPassword } from "@/server/vendor/account-password";
import { setVendorTeamMemberActive } from "@/server/vendor/team";
import { sha256 } from "@/server/vendor/crypto";
import { backgroundRefreshHeaders } from "@/domain/session-activity";

const vendorId = "00000000-0000-4000-8000-000000000001";
const ownerId = "11111111-1111-4111-8111-111111111111";
const staffId = "22222222-2222-4222-8222-222222222222";
const PASSWORD = "correct password here";
const DAY = 24 * 60 * 60_000;
const installs = {
  pixel: "0f8fad5b-d9cb-469f-a165-70867728950e",
  galaxy: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  iphone: "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b",
  tablet: "e4d909c2-90d0-4b6e-9b6f-9d1a7c4f3a21",
};
let now = Date.parse("2026-11-01T08:00:00.000Z");

function advance(milliseconds: number) {
  now += milliseconds;
  vi.setSystemTime(now);
}

function user(id: string, email: string, name: string) {
  return {
    id,
    email,
    name,
    platformRole: null,
    passwordSalt: "salt",
    passwordHash: "scrypt$N=131072,r=8,p=1$x",
    active: true,
    createdAt: "2026-09-18T00:00:00.000Z",
  };
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
      user(ownerId, "owner@example.com", "Owner"),
      user(staffId, "staff@example.com", "Staff"),
    ],
    memberships: [
      {
        vendorId,
        userId: ownerId,
        role: "owner",
        active: true,
        isDefault: true,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
      {
        vendorId,
        userId: staffId,
        role: "staff",
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

function sessions(): VendorSessionRecord[] {
  return (memory.database as VendorDatabase).sessions;
}

async function phoneSignIn(install: string, email = "owner@example.com") {
  const login = await authenticateVendorAppLogin({
    email,
    password: PASSWORD,
    device: {
      installationId: install,
      platform: "android",
      model: "Pixel 8",
      appVersion: "1.0.0+1",
    },
  });
  expect(login).not.toBeNull();
  return login!;
}

async function browserSignIn(email = "owner@example.com") {
  const login = await authenticateVendorLogin(email, PASSWORD);
  expect(login).not.toBeNull();
  return login!.token;
}

function phoneSession(token: string, countsAsActivity = true) {
  return getVendorSessionByToken(token, undefined, { scope: "vendor_app", countsAsActivity });
}

function request(headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/vendor/chapega/bootstrap", { headers });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  now = Date.parse("2026-11-01T08:00:00.000Z");
  vi.setSystemTime(now);
  memory.database = database();
  memory.writes = 0;
  memory.tokens = 0;
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VENDOR_EMAIL", "");
  vi.stubEnv("VENDOR_PASSWORD", "");
  vi.stubEnv("VENDOR_APP_SESSION_DAYS", "");
  vi.stubEnv("VENDOR_APP_SESSION_IDLE_DAYS", "");
  vi.stubEnv("VENDOR_APP_MAX_DEVICES", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Chapega Studio app sign-in (local store)", () => {
  it("issues a prefixed token and keeps only hashes of it and of the device", async () => {
    const login = await phoneSignIn(installs.pixel);

    expect(login.token).toMatch(/^chapega_app_[A-Za-z0-9_-]{43}$/);
    expect(login.expiresAt.getTime()).toBe(now + 14 * DAY);
    expect(login.absoluteExpiresAt.getTime()).toBe(now + 30 * DAY);
    expect(login.signedOutDevices).toBe(0);
    const [stored] = sessions();
    expect(stored).toMatchObject({
      idHash: sha256(login.token),
      scope: "vendor_app",
      device: { hash: vendorAppDeviceHash(installs.pixel), platform: "android", model: "Pixel 8" },
    });
    const saved = JSON.stringify(memory.database);
    expect(saved).not.toContain(login.token);
    expect(saved).not.toContain(installs.pixel);
  });

  it("keeps the phone and the web Studio signed in alongside each other", async () => {
    const browser = await browserSignIn();
    const phone = await phoneSignIn(installs.pixel);
    const browserAgain = await browserSignIn();

    expect(
      await getRequestVendorUser(request({ cookie: `chapega_vendor_session=${browser}` })),
    ).not.toBeNull();
    expect(
      await getRequestVendorUser(request({ cookie: `chapega_vendor_session=${browserAgain}` })),
    ).not.toBeNull();
    expect(await phoneSession(phone.token)).not.toBeNull();
  });

  it("replaces a phone's own earlier session when it signs in again", async () => {
    const first = await phoneSignIn(installs.pixel);
    const second = await phoneSignIn(installs.pixel);

    expect(await phoneSession(first.token)).toBeNull();
    expect(await phoneSession(second.token)).not.toBeNull();
    expect(sessions().filter((session) => session.scope === "vendor_app")).toHaveLength(1);
  });

  it("signs out the phone used least recently when a fourth one signs in", async () => {
    const pixel = await phoneSignIn(installs.pixel);
    const galaxy = await phoneSignIn(installs.galaxy);
    const iphone = await phoneSignIn(installs.iphone);
    advance(DAY);
    await phoneSession(pixel.token);
    await phoneSession(iphone.token);

    const tablet = await phoneSignIn(installs.tablet);

    expect(tablet.signedOutDevices).toBe(1);
    expect(await phoneSession(galaxy.token)).toBeNull();
    for (const kept of [pixel, iphone, tablet]) {
      expect(await phoneSession(kept.token)).not.toBeNull();
    }
  });

  it("honours VENDOR_APP_MAX_DEVICES", async () => {
    vi.stubEnv("VENDOR_APP_MAX_DEVICES", "1");
    const pixel = await phoneSignIn(installs.pixel);
    const galaxy = await phoneSignIn(installs.galaxy);

    expect(galaxy.signedOutDevices).toBe(1);
    expect(await phoneSession(pixel.token)).toBeNull();
  });
});

describe("a token only works the way it was issued", () => {
  it("refuses an app token sent as the Studio cookie, and a Studio token sent as Bearer", async () => {
    const browser = await browserSignIn();
    const phone = await phoneSignIn(installs.pixel);

    expect(
      await getRequestVendorUser(request({ cookie: `chapega_vendor_session=${phone.token}` })),
    ).toBeNull();
    expect(await getRequestVendorUser(request({ authorization: `Bearer ${browser}` }))).toBeNull();
    expect(
      await getRequestVendorUser(request({ authorization: `Bearer ${phone.token}` })),
    ).not.toBeNull();
  });

  it("uses only the Bearer token when one is sent, and ignores other schemes", async () => {
    const browser = await browserSignIn();
    const phone = await phoneSignIn(installs.pixel);
    const cookie = `chapega_vendor_session=${browser}`;

    // A malformed Bearer token never falls back to the cookie.
    expect(
      await getRequestVendorUser(request({ cookie, authorization: "Bearer nope" })),
    ).toBeNull();
    expect(await getRequestVendorUser(request({ cookie, authorization: "Bearer" }))).toBeNull();
    expect(
      await getRequestVendorUser(
        request({ cookie: "chapega_vendor_session=x", authorization: `bearer ${phone.token}` }),
      ),
    ).not.toBeNull();
    // Browser HTTP authentication (Basic) is not ours: the cookie still counts.
    expect(
      await getRequestVendorUser(request({ cookie, authorization: "Basic dXNlcjpwYXNz" })),
    ).not.toBeNull();
  });
});

describe("phone session lifetime", () => {
  it("ends after 14 days without use", async () => {
    const phone = await phoneSignIn(installs.pixel);

    advance(13 * DAY);
    expect(await phoneSession(phone.token)).not.toBeNull();
    advance(13 * DAY);
    expect(await phoneSession(phone.token)).not.toBeNull();
    advance(14 * DAY + 1);
    expect(await phoneSession(phone.token)).toBeNull();
  });

  it("ends after 30 days however often it is used", async () => {
    const phone = await phoneSignIn(installs.pixel);

    for (let day = 1; day < 30; day += 1) {
      advance(DAY);
      expect(await phoneSession(phone.token), `day ${day}`).not.toBeNull();
    }
    advance(DAY);
    expect(await phoneSession(phone.token)).toBeNull();
  });

  it("is not extended by background polling, and writes its expiry at most every 15 minutes", async () => {
    const phone = await phoneSignIn(installs.pixel);
    const writesAfterLogin = memory.writes;

    advance(10 * 60_000);
    await phoneSession(phone.token);
    expect(memory.writes).toBe(writesAfterLogin);

    advance(13 * DAY);
    await phoneSession(phone.token, false);
    expect(memory.writes).toBe(writesAfterLogin);
    const polled = await getRequestVendorUser(
      request({ authorization: `Bearer ${phone.token}`, ...backgroundRefreshHeaders }),
    );
    expect(polled).not.toBeNull();
    advance(DAY + 1);
    expect(await phoneSession(phone.token)).toBeNull();
  });

  it("reports when it ends", async () => {
    const phone = await phoneSignIn(installs.pixel);
    advance(DAY);

    const session = await phoneSession(phone.token);

    expect(session?.expiresAt).toBe(now + 14 * DAY);
    expect(session?.absoluteExpiresAt).toBe(phone.absoluteExpiresAt.getTime());
    expect(session?.sessionHash).toBe(sha256(phone.token));
  });
});

describe("ending phone sessions", () => {
  it("a password change from the phone keeps that phone and ends every other session", async () => {
    const browser = await browserSignIn();
    const pixel = await phoneSignIn(installs.pixel);
    const galaxy = await phoneSignIn(installs.galaxy);

    await changeOwnPassword(
      {
        scope: "vendor",
        userId: ownerId,
        email: "owner@example.com",
        name: "Owner",
        sessionHash: sha256(pixel.token),
      },
      { currentPassword: PASSWORD, newPassword: "lanterns over the quiet river bank" },
    );

    expect(sessions().map((session) => session.idHash)).toEqual([sha256(pixel.token)]);
    expect(await phoneSession(galaxy.token)).toBeNull();
    expect(
      await getRequestVendorUser(request({ cookie: `chapega_vendor_session=${browser}` })),
    ).toBeNull();
  });

  it("an owner on the phone can remove a member, which signs out the member's phones", async () => {
    const owner = await phoneSignIn(installs.pixel);
    const staff = await phoneSignIn(installs.galaxy, "staff@example.com");
    const ownerSession = await phoneSession(owner.token);

    await setVendorTeamMemberActive(
      {
        access: vendorAccessContextFromUser(ownerSession!.user),
        sessionHash: ownerSession!.sessionHash,
      },
      staffId,
      false,
    );

    expect(await phoneSession(staff.token)).toBeNull();
    expect(await phoneSession(owner.token)).not.toBeNull();
  });
});
