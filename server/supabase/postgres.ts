import "server-only";

import postgres from "postgres";
import { getSupabaseConfiguration } from "@/server/supabase/config";

type PostgresRuntime = {
  client?: postgres.Sql;
};

const runtimeKey = "__chapegaSupabasePostgresRuntime";
const runtime = globalThis as typeof globalThis & {
  [runtimeKey]?: PostgresRuntime;
};
const shared = runtime[runtimeKey] ?? (runtime[runtimeKey] = {});

export function getSupabasePostgres(): postgres.Sql {
  if (shared.client) return shared.client;
  const { databaseUrl } = getSupabaseConfiguration();
  shared.client = postgres(databaseUrl, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    transform: { undefined: null },
  });
  return shared.client;
}
