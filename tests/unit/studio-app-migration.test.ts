import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SESSION_LIFETIME_CEILING_MS, SESSION_SETTINGS } from "@/server/security/session-policy";

const DAY = 24 * 60 * 60_000;

async function migration() {
  return readFile(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261101120000_vendor_app_sessions_and_push.sql",
    ),
    "utf8",
  );
}

/** Each `create [or replace] function private.name(...)` with its body. */
function functions(sql: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /create (?:or replace )?function private\.(\w+)\(([\s\S]*?)\$\$;/g;
  for (const match of sql.matchAll(pattern)) result.set(match[1], match[0]);
  return result;
}

describe("every migration", () => {
  it("keeps regular expressions within Postgres's repetition limit", async () => {
    // Postgres refuses a bound above 255 ("invalid repetition count"), but
    // only when the expression is first evaluated, not when the migration runs.
    const directory = path.join(process.cwd(), "supabase", "migrations");
    for (const file of (await readdir(directory)).filter((name) => name.endsWith(".sql"))) {
      const sql = await readFile(path.join(directory, file), "utf8");
      for (const [bound, low, high] of sql.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
        expect(Number(low), `${file}: ${bound}`).toBeLessThanOrEqual(255);
        if (high) expect(Number(high), `${file}: ${bound}`).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("migration 20261101120000 (phone sessions and push)", () => {
  it("caps phone sessions at the longest lifetime the app can be configured to", async () => {
    const sql = await migration();
    const ceilingDays = SESSION_LIFETIME_CEILING_MS.vendor_app / DAY;

    expect(ceilingDays).toBe(SESSION_SETTINGS.vendorAppDays.max);
    expect(SESSION_LIFETIME_CEILING_MS.vendor).toBe(SESSION_SETTINGS.vendorHours.max * 3_600_000);
    const refresh = sql.slice(sql.indexOf("create policy chapega_sessions_refresh"));
    expect(refresh).toContain(`when 'vendor_app' then interval '${ceilingDays} days'`);
    expect(refresh).toContain("else interval '168 hours'");
    expect(sql).toContain("constraint vendor_sessions_lifetime_check");
  });

  it("pins every definer function's search_path", async () => {
    const definers = [...functions(await migration()).entries()].filter(([, body]) =>
      body.includes("security definer"),
    );

    expect(definers.map(([name]) => name).sort()).toEqual(
      [
        "claim_order_push_targets",
        "current_app_session_user_id",
        "current_vendor_owner_id",
        "finish_order_push",
        "purge_expired_records",
        "register_push_token",
        "set_vendor_team_member_active",
        "unregister_push_token",
      ].sort(),
    );
    for (const [name, body] of definers) {
      expect(body, name).toContain("set search_path = ''");
    }
  });

  it("lets the app run only the push functions, and keeps the internal ones private", async () => {
    const sql = await migration();
    for (const name of [
      "register_push_token",
      "unregister_push_token",
      "claim_order_push_targets",
      "finish_order_push",
      "set_vendor_team_member_active",
    ]) {
      expect(sql, name).toMatch(
        new RegExp(
          `revoke all on function private\\.${name}\\([^)]*\\)\\s+from public, anon, authenticated, service_role;`,
        ),
      );
      expect(sql, name).toMatch(
        new RegExp(`grant execute on function private\\.${name}\\([^)]*\\)\\s+to chapega_app;`),
      );
    }
    for (const name of [
      "current_app_session_user_id",
      "current_vendor_owner_id",
      "purge_expired_records",
    ]) {
      expect(sql, name).toMatch(
        new RegExp(
          `revoke all on function private\\.${name}\\(\\)\\s+from public, anon, authenticated, service_role, chapega_app;`,
        ),
      );
      expect(sql, name).not.toMatch(new RegExp(`grant execute on function private\\.${name}\\(`));
    }
  });

  it("gives the app no direct access to the push tables", async () => {
    const sql = await migration();
    for (const table of ["vendor_push_registrations", "order_push_dispatches"]) {
      expect(sql, table).toContain(`alter table private.${table} enable row level security;`);
      expect(sql, table).toContain(`alter table private.${table} force row level security;`);
      expect(sql, table).toMatch(
        new RegExp(
          `revoke all on private\\.${table}\\s+from public, anon, authenticated, service_role, chapega_app;`,
        ),
      );
      expect(sql, table).not.toMatch(new RegExp(`create policy \\w+\\s+on private\\.${table}`));
    }
  });

  it("ends a phone's notifications with its session", async () => {
    const sql = await migration();
    expect(sql).toMatch(
      /foreign key \(session_id_hash, session_scope\)\s+references private\.vendor_sessions \(id_hash, session_scope\)\s+on delete cascade/,
    );
  });

  it("lets owners manage the team, and deactivation sign out phones, from either kind of session", async () => {
    const owner = functions(await migration()).get("current_vendor_owner_id")!;
    const deactivate = functions(await migration()).get("set_vendor_team_member_active")!;
    expect(owner).toContain("sessions.session_scope in ('vendor', 'vendor_app')");
    expect(deactivate).toContain("session_scope in ('vendor', 'vendor_app')");
  });
});
