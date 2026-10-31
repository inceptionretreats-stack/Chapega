import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

describe("Studio API routes and the Chapega Studio app", () => {
  it("read the session only through the shared helpers, so every route accepts the app's Bearer token", () => {
    const root = path.join(process.cwd(), "app", "api");
    const files = [
      ...routeFiles(path.join(root, "vendor")),
      ...routeFiles(path.join(root, "studio-app")),
    ];
    // Studio sign-in and sign-out set and clear the browser's cookie themselves.
    const cookieRoutes = new Set(
      ["vendor/login/route.ts", "vendor/logout/route.ts"].map((file) => path.join(root, file)),
    );

    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (cookieRoutes.has(file)) continue;
      expect(source, path.relative(root, file)).not.toMatch(/\.cookies\b|cookies\(\)/);
      expect(source, path.relative(root, file)).not.toMatch(/headers\.get\(["']authorization/i);
    }
  });
});
