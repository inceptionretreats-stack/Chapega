import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorAuditRecord, VendorDatabase } from "@/server/vendor/database";
import type { VendorAccessContext, VendorCapabilities, VendorRole } from "@/types/vendor";

const memory = vi.hoisted(() => ({ database: null as unknown, auditCounter: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/supabase/config", () => ({ usesSupabaseBackend: () => false }));
vi.mock("@/server/vendor/crypto", () => ({
  derivePasswordHash: async (password: string) => ({
    salt: `salt:${password}`,
    hash: `hash:${password}`,
  }),
  verifyPassword: async (password: string, _salt: string, hash: string) =>
    hash === `hash:${password}`,
  DUMMY_PASSWORD_HASH: "dummy-hash",
  DUMMY_PASSWORD_SALT: "dummy-salt",
}));
vi.mock("@/server/vendor/database", () => ({
  newAuditRecord: (
    actorId: string,
    action: string,
    entityType: VendorAuditRecord["entityType"],
    entityId: string,
    vendorId: string | null = null,
  ): VendorAuditRecord => ({
    id: `audit-${++memory.auditCounter}`,
    vendorId,
    actorId,
    action,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
  }),
  readLocalVendorDatabase: async () => structuredClone(memory.database),
  updateLocalVendorDatabase: async <T>(mutation: (draft: VendorDatabase) => T) => {
    const draft = structuredClone(memory.database) as VendorDatabase;
    const result = await mutation(draft);
    memory.database = draft;
    return structuredClone(result);
  },
}));

import { assertNewPasswordAcceptable, changeOwnPassword } from "@/server/vendor/account-password";
import {
  addVendorTeamMember,
  listVendorTeam,
  resetVendorTeamPassword,
  setVendorTeamMemberActive,
  setVendorTeamMemberRole,
} from "@/server/vendor/team";

const SHOP = {
  id: "vendor-a",
  slug: "chapega",
  displayName: "Chapega.com",
  status: "active" as const,
};
const OTHER = { id: "vendor-b", slug: "second", displayName: "Second", status: "active" as const };
const OWNER = "owner-1";
const STAFF = "staff-1";
const SHARED = "shared-1";
const OUTSIDER = "outsider-1";
const LATER = "2099-01-01T00:00:00.000Z";
const EARLIER = "2026-01-01T00:00:00.000Z";

function capabilities(role: VendorRole): VendorCapabilities {
  return {
    view_dashboard: true,
    manage_orders: true,
    manage_catalogue: role !== "staff",
    manage_settings: role === "owner",
    manage_team: role === "owner",
    erase_customer_data: role !== "staff",
  };
}

function access(userId: string, role: VendorRole, vendor = SHOP): VendorAccessContext {
  return {
    user: {
      id: userId,
      email: `${userId}@example.test`,
      name: userId,
      platformRole: null,
      role,
      activeVendor: vendor,
      memberships: [],
      capabilities: capabilities(role),
    },
    vendor,
    membership: { vendorId: vendor.id, userId, role },
    capabilities: capabilities(role),
  };
}

const owner = { access: access(OWNER, "owner"), sessionHash: "owner-session" };

function user(id: string, overrides: Partial<VendorDatabase["users"][number]> = {}) {
  return {
    id,
    email: `${id}@example.test`,
    name: id,
    platformRole: null,
    passwordSalt: `salt:old-${id}`,
    passwordHash: `hash:old-${id}`,
    active: true,
    createdAt: EARLIER,
    ...overrides,
  };
}

function membership(vendorId: string, userId: string, role: VendorRole, isDefault = true) {
  return { vendorId, userId, role, active: true, isDefault, createdAt: EARLIER };
}

function session(
  idHash: string,
  userId: string,
  scope: "vendor" | "platform",
  vendorId: string | null,
) {
  return { idHash, userId, scope, activeVendorId: vendorId, createdAt: EARLIER, expiresAt: LATER };
}

function seed(): VendorDatabase {
  return {
    version: 2,
    revision: 1,
    vendors: [
      { ...SHOP, revision: 1, createdAt: EARLIER, updatedAt: EARLIER },
      { ...OTHER, revision: 1, createdAt: EARLIER, updatedAt: EARLIER },
    ],
    users: [user(OWNER), user(STAFF), user(SHARED), user(OUTSIDER)],
    memberships: [
      membership(SHOP.id, OWNER, "owner"),
      membership(SHOP.id, STAFF, "staff"),
      membership(SHOP.id, SHARED, "staff", false),
      membership(OTHER.id, SHARED, "manager", true),
      membership(OTHER.id, OUTSIDER, "owner"),
    ],
    sessions: [
      session("owner-session", OWNER, "vendor", SHOP.id),
      session("owner-platform", OWNER, "platform", null),
      session("staff-here", STAFF, "vendor", SHOP.id),
      session("staff-there", STAFF, "vendor", OTHER.id),
    ],
    products: [],
    orders: [],
    settings: [],
    audit: [],
  };
}

const state = () => memory.database as VendorDatabase;

beforeEach(() => {
  memory.database = seed();
  memory.auditCounter = 0;
});

describe("team management (local store)", () => {
  it("lists the shop's people with what the owner may do to each", async () => {
    const members = await listVendorTeam(owner);
    expect(members.map((member) => member.userId)).toEqual([OWNER, SHARED, STAFF]);
    expect(members[0]).toMatchObject({
      isCurrentUser: true,
      canManage: false,
      canResetPassword: false,
    });
    expect(members.find((member) => member.userId === STAFF)).toMatchObject({
      canManage: true,
      canResetPassword: true,
    });
    // Also on another shop: role and access yes, password no.
    expect(members.find((member) => member.userId === SHARED)).toMatchObject({
      canManage: true,
      canResetPassword: false,
    });
  });

  it("is for live, unflagged owners only", async () => {
    await expect(
      listVendorTeam({ access: access(STAFF, "staff"), sessionHash: "staff-here" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      listVendorTeam({ ...owner, sessionHash: "no-such-session" }),
    ).rejects.toMatchObject({
      status: 403,
    });
    state().users[0] = { ...state().users[0], mustChangePassword: true };
    await expect(listVendorTeam(owner)).rejects.toMatchObject({ status: 403 });
  });

  it("adds a member with a temporary password they must replace", async () => {
    const member = await addVendorTeamMember(owner, {
      name: "Asha",
      email: "asha@example.test",
      role: "manager",
      temporaryPassword: "mango orchards in monsoon",
    });
    expect(member).toMatchObject({ role: "manager", passwordChangePending: true, active: true });
    expect(state().users.find((candidate) => candidate.id === member.userId)).toMatchObject({
      platformRole: null,
      passwordHash: "hash:mango orchards in monsoon",
      mustChangePassword: true,
    });
    expect(state().memberships).toContainEqual(
      expect.objectContaining({ vendorId: SHOP.id, userId: member.userId, isDefault: true }),
    );
    expect(state().audit.at(-1)).toMatchObject({ action: "team.member.added", actorId: OWNER });
  });

  it("refuses emails already on the platform without saying where", async () => {
    const add = (email: string) =>
      addVendorTeamMember(owner, {
        name: "Someone",
        email,
        role: "staff",
        temporaryPassword: "mango orchards in monsoon",
      });
    await expect(add(`${STAFF}@example.test`)).rejects.toMatchObject({
      status: 409,
      code: "ALREADY_ON_TEAM",
    });
    await expect(add(`${OUTSIDER}@example.test`)).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_UNAVAILABLE",
      fields: { email: [expect.not.stringContaining("Second")] },
    });
  });

  it("changes roles, but never owners, the caller or another shop's people", async () => {
    await expect(setVendorTeamMemberRole(owner, STAFF, "manager")).resolves.toMatchObject({
      role: "manager",
    });
    const audits = state().audit.length;
    await setVendorTeamMemberRole(owner, STAFF, "manager");
    expect(state().audit).toHaveLength(audits);
    await expect(setVendorTeamMemberRole(owner, OWNER, "staff")).rejects.toMatchObject({
      code: "SELF_CHANGE",
    });
    await expect(setVendorTeamMemberRole(owner, OUTSIDER, "staff")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("removes access to this shop only, and restores it", async () => {
    await setVendorTeamMemberActive(owner, STAFF, false);
    expect(state().sessions.map((candidate) => candidate.idHash)).toEqual([
      "owner-session",
      "owner-platform",
      "staff-there",
    ]);
    await expect(setVendorTeamMemberActive(owner, STAFF, true)).resolves.toMatchObject({
      active: true,
    });
    expect(state().audit.map((record) => record.action)).toEqual([
      "team.member.deactivated",
      "team.member.reactivated",
    ]);
  });

  it("keeps one default shop per person when access returns", async () => {
    state().memberships = state().memberships.map((candidate) =>
      candidate.userId === SHARED && candidate.vendorId === SHOP.id
        ? { ...candidate, active: false, isDefault: true }
        : candidate,
    );
    await setVendorTeamMemberActive(owner, SHARED, true);
    const here = state().memberships.find(
      (candidate) => candidate.userId === SHARED && candidate.vendorId === SHOP.id,
    );
    expect(here).toMatchObject({ active: true, isDefault: false });
  });

  it("sets a temporary password only for someone who belongs to this shop alone", async () => {
    await expect(
      resetVendorTeamPassword(owner, STAFF, "harbour gulls at sunrise"),
    ).resolves.toMatchObject({ passwordChangePending: true });
    expect(state().sessions.some((candidate) => candidate.userId === STAFF)).toBe(false);
    await expect(
      resetVendorTeamPassword(owner, SHARED, "harbour gulls at sunrise"),
    ).rejects.toMatchObject({ code: "PASSWORD_RESET_UNAVAILABLE" });
    await expect(resetVendorTeamPassword(owner, STAFF, "short")).rejects.toMatchObject({
      status: 400,
      fields: { temporaryPassword: [expect.any(String)] },
    });
    await expect(
      resetVendorTeamPassword(owner, OWNER, "harbour gulls at sunrise"),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("changing your own password (local store)", () => {
  const actor = {
    scope: "vendor" as const,
    userId: STAFF,
    email: `${STAFF}@example.test`,
    name: STAFF,
    sessionHash: "staff-here",
  };

  it("keeps this session, ends the others and clears a temporary password", async () => {
    state().users[1] = { ...state().users[1], mustChangePassword: true };
    await changeOwnPassword(actor, {
      currentPassword: `old-${STAFF}`,
      newPassword: "violet trams hum past midnight",
    });
    expect(state().users[1]).toMatchObject({
      passwordHash: "hash:violet trams hum past midnight",
      mustChangePassword: false,
    });
    expect(state().sessions.filter((candidate) => candidate.userId === STAFF)).toEqual([
      expect.objectContaining({ idHash: "staff-here" }),
    ]);
    expect(state().audit.at(-1)).toMatchObject({
      action: "vendor.password.changed",
      vendorId: SHOP.id,
    });
  });

  it("answers a wrong current password with a field error, not a sign-out", async () => {
    await expect(
      changeOwnPassword(actor, {
        currentPassword: "wrong",
        newPassword: "violet trams hum past midnight",
      }),
    ).rejects.toMatchObject({ status: 400, fields: { currentPassword: [expect.any(String)] } });
  });

  it("refuses when the session ended in the meantime", async () => {
    await expect(
      changeOwnPassword(
        { ...actor, sessionHash: "gone" },
        { currentPassword: `old-${STAFF}`, newPassword: "violet trams hum past midnight" },
      ),
    ).rejects.toMatchObject({ status: 409, code: "PASSWORD_CHANGED_ELSEWHERE" });
  });

  it("checks the new password before anything is counted", () => {
    expect(() =>
      assertNewPasswordAcceptable(actor, { currentPassword: "same", newPassword: "same" }),
    ).toThrow(expect.objectContaining({ code: "PASSWORD_UNCHANGED" }));
    expect(() =>
      assertNewPasswordAcceptable(actor, { currentPassword: "x", newPassword: "short" }),
    ).toThrow(expect.objectContaining({ code: "WEAK_PASSWORD" }));
  });
});
