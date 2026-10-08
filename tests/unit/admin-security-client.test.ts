// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddVendorDialog } from "@/components/admin/add-vendor-dialog";
import { VendorStatusDialog } from "@/components/admin/vendor-status-dialog";
import {
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
} from "@/server/security/password-policy";
import { makeAdminVendor } from "./admin-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("vendor status changes (AUD-16)", () => {
  it("sends the status the admin saw, not the vendor revision", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ vendor: makeAdminVendor({ status: "suspended" }) }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const vendor = makeAdminVendor({ status: "active" });
    render(createElement(VendorStatusDialog, { vendor, onClose: vi.fn(), onSaved: vi.fn() }));

    await userEvent.click(screen.getByRole("button", { name: `Suspend ${vendor.displayName}` }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      status: "suspended",
      expectedStatus: "active",
    });
  });
});

describe("temporary owner password (AUD-18)", () => {
  it("matches the server's new-password policy", () => {
    render(createElement(AddVendorDialog, { onClose: vi.fn(), onCreated: vi.fn() }));
    const password = screen.getByLabelText(/temporary password/i);

    expect(password).toHaveAttribute("minLength", String(NEW_PASSWORD_MIN_LENGTH));
    expect(password).toHaveAttribute("maxLength", String(NEW_PASSWORD_MAX_LENGTH));
    expect(password).toHaveAccessibleDescription(/at least 15 characters/i);
    // NIST: no composition rules, so the hint must not ask for them.
    expect(password).not.toHaveAccessibleDescription(/upper|lower|number/i);
  });
});
