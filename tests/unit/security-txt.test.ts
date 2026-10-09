import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const securityTxt = readFileSync(
  new URL("../../public/.well-known/security.txt", import.meta.url),
  "utf8",
);

function field(name: string): string[] {
  return securityTxt
    .split(/\r?\n/)
    .filter((line) => line.startsWith(`${name}: `))
    .map((line) => line.slice(name.length + 2).trim());
}

describe("/.well-known/security.txt (RFC 9116)", () => {
  it("names a contact", () => {
    expect(field("Contact").length).toBeGreaterThan(0);
    for (const contact of field("Contact")) expect(contact).toMatch(/^(mailto:|https:\/\/)/);
  });

  it("has exactly one Expires date that has not passed", () => {
    const [expires, ...extra] = field("Expires");
    expect(extra).toHaveLength(0);
    // When this fails, set a new date at most a year ahead (and in SECURITY.md).
    expect(Date.parse(expires)).toBeGreaterThan(Date.now());
  });
});
