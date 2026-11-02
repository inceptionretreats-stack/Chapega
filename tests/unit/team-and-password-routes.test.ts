import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorUser } from "@/types/vendor";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  listVendorTeam: vi.fn(),
  addVendorTeamMember: vi.fn(),
  setVendorTeamMemberRole: vi.fn(),
  setVendorTeamMemberActive: vi.fn(),
  changeOwnPassword: vi.fn(),
  refund: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/vendor/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/vendor/auth")>()),
  getRequestVendorSession: mocks.session,
}));
vi.mock("@/server/vendor/team", () => ({
  listVendorTeam: mocks.listVendorTeam,
  addVendorTeamMember: mocks.addVendorTeamMember,
  setVendorTeamMemberRole: mocks.setVendorTeamMemberRole,
  setVendorTeamMemberActive: mocks.setVendorTeamMemberActive,
  resetVendorTeamPassword: vi.fn(),
}));
vi.mock("@/server/vendor/account-password", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/vendor/account-password")>()),
  changeOwnPassword: mocks.changeOwnPassword,
}));
vi.mock("@/server/vendor/throttle", () => ({
  beginCredentialIssue: async () => ({ refund: mocks.refund }),
  beginPasswordChangeAttempt: async () => ({ succeeded: async () => undefined }),
}));

import { GET as teamGet, POST as teamPost } from "@/app/api/vendor/[vendorSlug]/team/route";
import { PATCH as memberPatch } from "@/app/api/vendor/[vendorSlug]/team/[userId]/route";
import { POST as passwordPost } from "@/app/api/vendor/[vendorSlug]/account/password/route";
import { generateTemporaryPassword, TEAM_ROLE_SUMMARIES } from "@/domain/team";
import { newPasswordProblem } from "@/server/security/password-policy";
import { capabilitiesForVendorRole, vendorAccessContextFromUser } from "@/server/vendor/auth";

const vendor = {
  id: "vendor-a",
  slug: "chapega",
  displayName: "Chapega.com",
  status: "active" as const,
};
const member = "11111111-1111-4111-8111-111111111111";

function vendorUser(overrides: Partial<VendorUser> = {}): VendorUser {
  return {
    id: "owner-1",
    email: "owner@example.test",
    name: "Owner",
    platformRole: null,
    role: "owner",
    activeVendor: vendor,
    memberships: [],
    capabilities: capabilitiesForVendorRole("owner"),
    ...overrides,
  };
}

function request(method: string, body?: unknown, origin = "http://localhost") {
  return new NextRequest("http://localhost/api/vendor/chapega/team", {
    method,
    headers: { "content-type": "application/json", origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const slug = { params: Promise.resolve({ vendorSlug: "chapega" }) };

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.session.mockResolvedValue({ user: vendorUser(), sessionHash: "session-hash" });
});

describe("temporary passwords and roles", () => {
  it("generates passwords that pass the policy, with no look-alike characters", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[a-hj-km-np-z2-9]{5}(-[a-hj-km-np-z2-9]{5}){3}$/);
      expect(newPasswordProblem(password, { email: "a@b.test", name: "Asha" })).toBeNull();
      seen.add(password);
    }
    expect(seen.size).toBe(50);
  });

  it("describes each role by what it can do", () => {
    expect(capabilitiesForVendorRole("staff").manage_catalogue).toBe(false);
    expect(TEAM_ROLE_SUMMARIES.staff).toMatch(/Orders only/);
    expect(capabilitiesForVendorRole("manager").erase_customer_data).toBe(true);
    expect(TEAM_ROLE_SUMMARIES.manager).toMatch(/remove a customer's details/);
  });
});

describe("the temporary-password gate", () => {
  it("blocks every Studio action until the password is changed", () => {
    expect(() => vendorAccessContextFromUser(vendorUser({ mustChangePassword: true }))).toThrow(
      expect.objectContaining({ status: 403, code: "PASSWORD_CHANGE_REQUIRED" }),
    );
    expect(vendorAccessContextFromUser(vendorUser()).vendor.id).toBe(vendor.id);
  });

  it("refuses team routes but still lets the password be changed", async () => {
    mocks.session.mockResolvedValue({
      user: vendorUser({ mustChangePassword: true }),
      sessionHash: "session-hash",
    });
    const blocked = await teamGet(request("GET"), slug);
    expect(blocked.status).toBe(403);
    await expect(blocked.json()).resolves.toMatchObject({
      error: { code: "PASSWORD_CHANGE_REQUIRED" },
    });

    const changed = await passwordPost(
      request("POST", {
        currentPassword: "temporary-1",
        newPassword: "violet trams hum past midnight",
      }),
      slug,
    );
    expect(changed.status).toBe(200);
    expect(mocks.changeOwnPassword).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "vendor", userId: "owner-1", sessionHash: "session-hash" }),
      { currentPassword: "temporary-1", newPassword: "violet trams hum past midnight" },
    );
  });

  it("asks a signed-out caller to sign in", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await teamGet(request("GET"), slug)).status).toBe(401);
  });
});

describe("team and password routes", () => {
  it("passes the owner's access and session to the team service", async () => {
    mocks.listVendorTeam.mockResolvedValue([]);
    const response = await teamGet(request("GET"), slug);
    expect(response.status).toBe(200);
    expect(mocks.session).toHaveBeenCalledWith(expect.anything(), "chapega");
    expect(mocks.listVendorTeam).toHaveBeenCalledWith({
      access: expect.objectContaining({ vendor }),
      sessionHash: "session-hash",
    });
  });

  it("validates a new member before anything is counted, and refunds a success", async () => {
    const weak = await teamPost(
      request("POST", {
        name: "Asha",
        email: "asha@example.test",
        role: "staff",
        temporaryPassword: "short",
      }),
      slug,
    );
    expect(weak.status).toBe(400);
    await expect(weak.json()).resolves.toMatchObject({
      error: { fields: { temporaryPassword: [expect.any(String)] } },
    });
    const owner = await teamPost(
      request("POST", {
        name: "Asha",
        email: "asha@example.test",
        role: "owner",
        temporaryPassword: "mango orchards in monsoon",
      }),
      slug,
    );
    expect(owner.status).toBe(400);
    expect(mocks.addVendorTeamMember).not.toHaveBeenCalled();

    mocks.addVendorTeamMember.mockResolvedValue({ userId: member });
    const created = await teamPost(
      request("POST", {
        name: "Asha",
        email: "Asha@Example.test",
        role: "staff",
        temporaryPassword: "mango orchards in monsoon",
      }),
      slug,
    );
    expect(created.status).toBe(201);
    expect(mocks.addVendorTeamMember).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "asha@example.test" }),
    );
    expect(mocks.refund).toHaveBeenCalledTimes(1);
  });

  it("takes exactly one change per member update", async () => {
    const context = { params: Promise.resolve({ vendorSlug: "chapega", userId: member }) };
    mocks.setVendorTeamMemberRole.mockResolvedValue({ userId: member, role: "manager" });
    expect((await memberPatch(request("PATCH", { role: "manager" }), context)).status).toBe(200);
    expect(
      (await memberPatch(request("PATCH", { role: "manager", active: false }), context)).status,
    ).toBe(400);
    const badId = { params: Promise.resolve({ vendorSlug: "chapega", userId: "not-a-uuid" }) };
    expect((await memberPatch(request("PATCH", { active: false }), badId)).status).toBe(400);
  });

  it("rejects cross-site writes", async () => {
    const response = await passwordPost(
      request(
        "POST",
        { currentPassword: "x", newPassword: "violet trams hum past midnight" },
        "https://attacker.example",
      ),
      slug,
    );
    expect(response.status).toBe(403);
    expect(mocks.changeOwnPassword).not.toHaveBeenCalled();
  });
});

describe("team and credentials migration 20261030122000", () => {
  it("adds narrow, owner-run functions and no policies", async () => {
    const sql = (
      await readFile(
        path.join(
          process.cwd(),
          "supabase",
          "migrations",
          "20261030122000_team_and_credentials.sql",
        ),
        "utf8",
      )
    ).replace(/\r\n/g, "\n");
    const functions = [...sql.matchAll(/create function private\.(\w+)\(/g)].map(
      (match) => match[1],
    );
    expect(functions).toEqual([
      "current_vendor_owner_id",
      "change_own_password",
      "list_vendor_team",
      "add_vendor_team_member",
      "set_vendor_team_member_role",
      "set_vendor_team_member_active",
      "reset_vendor_team_password",
      "reset_vendor_owner_password",
    ]);
    expect(sql.match(/security definer/g)).toHaveLength(functions.length);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(functions.length);
    expect(sql).not.toMatch(/create policy|drop policy|grant (select|insert|update|delete)/i);
    expect(sql).toContain(
      "revoke all on function private.current_vendor_owner_id()\n  from public, anon, authenticated, service_role, chapega_app;",
    );
    expect(sql).not.toMatch(/grant execute on function private\.current_vendor_owner_id/);
    expect(sql).toContain("add column must_change_password boolean not null default false");
    // Same advisory lock key as sign-in (server/vendor/supabase-auth.ts).
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0))");
  });
});
