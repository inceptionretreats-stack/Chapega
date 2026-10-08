import { describe, expect, it } from "vitest";
import { validateBootstrapOwnerInput } from "@/scripts/bootstrap-supabase-owner";

const preview = { email: "owner@chapega.com", password: "Chapega@2026" };

function input(password: string, email = "asha.owner@example.com") {
  return { vendorSlug: "blue-door", email, password, name: "Asha Owner" };
}

describe("first-owner bootstrap password (AUD-3, AUD-18)", () => {
  it("applies the same new-password policy as every later account", () => {
    // Long enough, but a common phrase or built from the owner's own email.
    expect(() => validateBootstrapOwnerInput(input("passwordpassword123"), preview)).toThrow(
      /VENDOR_PASSWORD/,
    );
    expect(() => validateBootstrapOwnerInput(input("AshaOwner-2026!!"), preview)).toThrow(
      /VENDOR_PASSWORD/,
    );
  });

  it("still refuses the published preview pair and the placeholder", () => {
    expect(() =>
      validateBootstrapOwnerInput(input("replace-with-a-long-unique-password"), preview),
    ).toThrow();
    expect(() =>
      validateBootstrapOwnerInput(input("maple river lantern 42", preview.email), preview),
    ).toThrow(/preview/);
  });

  it("accepts a long, unrelated passphrase", () => {
    expect(validateBootstrapOwnerInput(input("maple river lantern 42"), preview)).toMatchObject({
      vendorSlug: "blue-door",
      email: "asha.owner@example.com",
    });
  });
});
