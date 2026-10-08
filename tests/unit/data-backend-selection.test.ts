import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { selectVendorDataBackend } from "@/server/config/data-backend";
import { getVendorDataBackend } from "@/server/supabase/config";

const VARIABLES = [
  "CHAPEGA_DATA_BACKEND",
  "SUPABASE_DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "ALLOW_LOCAL_VENDOR_BACKEND",
  "NODE_ENV",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * next.config.ts cannot import the server-only selector, so it uses a pure
 * copy. This test pins the two together for every combination that the
 * runtime selector accepts.
 */
describe("build-time data backend selection", () => {
  const backends = ["", "local", "supabase"];
  const flags = ["", "x"];
  const environments = ["development", "production"];

  for (const backend of backends) {
    for (const database of flags) {
      for (const project of flags) {
        for (const secret of flags) {
          for (const allowLocal of ["", "true"]) {
            for (const nodeEnv of environments) {
              const env = {
                CHAPEGA_DATA_BACKEND: backend,
                SUPABASE_DATABASE_URL: database && "postgresql://chapega_app.ref:pw@host/db",
                NEXT_PUBLIC_SUPABASE_URL: project && "https://ref.supabase.co",
                SUPABASE_SECRET_KEY: secret && "sb_secret",
                ALLOW_LOCAL_VENDOR_BACKEND: allowLocal,
                NODE_ENV: nodeEnv,
              };
              it(JSON.stringify(env), () => {
                for (const name of VARIABLES) vi.stubEnv(name, env[name]);
                let runtime: string;
                try {
                  runtime = getVendorDataBackend();
                } catch {
                  // The runtime refuses this combination at startup; the
                  // build only needs a deterministic answer.
                  return;
                }
                expect(selectVendorDataBackend(process.env)).toBe(runtime);
              });
            }
          }
        }
      }
    }
  }
});
