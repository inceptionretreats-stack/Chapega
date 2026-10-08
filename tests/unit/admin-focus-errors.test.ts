// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminError from "@/app/admin/error";
import { AddVendorDialog } from "@/components/admin/add-vendor-dialog";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { AdminPortal } from "@/components/admin/admin-portal";
import { VendorStatusDialog } from "@/components/admin/vendor-status-dialog";
import { makeAdminBootstrap, makeAdminVendor } from "./admin-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFailure(status: number, error: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error }), { status })),
  );
}

describe("admin login failures (AUD-22)", () => {
  it("moves focus to the failing field and ties the message to it", async () => {
    stubFailure(400, {
      code: "VALIDATION_ERROR",
      message: "Check the highlighted information and try again.",
      fields: { email: ["Enter a valid email address."] },
    });
    render(
      createElement(AdminLoginForm, {
        authenticationAvailable: true,
        previewCredentials: { email: "owner@chapega.com", password: "Chapega@2026" },
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in securely/i }));

    const email = screen.getByLabelText(/email address/i);
    await waitFor(() => expect(email).toHaveFocus());
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(/valid email/i);
  });

  it("moves focus to the alert when the failure is not field-specific", async () => {
    stubFailure(401, { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    render(
      createElement(AdminLoginForm, {
        authenticationAvailable: true,
        previewCredentials: { email: "owner@chapega.com", password: "Chapega@2026" },
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in securely/i }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(alert).toHaveTextContent(/incorrect/i);
  });

  it("offers a skip link that moves focus to the main region", async () => {
    render(
      createElement(AdminLoginForm, { authenticationAvailable: true, previewCredentials: null }),
    );
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
  });
});

describe("add-vendor server errors (AUD-22)", () => {
  async function fillAndSubmit() {
    await userEvent.type(screen.getByRole("textbox", { name: /vendor name/i }), "Blue Door");
    await userEvent.type(screen.getByRole("textbox", { name: /owner name/i }), "Asha");
    await userEvent.type(screen.getByRole("textbox", { name: /owner email/i }), "asha@example.com");
    await userEvent.type(screen.getByRole("textbox", { name: /whatsapp/i }), "9876543210");
    await userEvent.type(screen.getByLabelText(/temporary password/i), "Sufficient-Pass-123");
    await userEvent.click(screen.getByRole("button", { name: /create vendor/i }));
  }

  it("focuses the duplicate slug field", async () => {
    stubFailure(409, {
      code: "DUPLICATE",
      message: "That vendor URL is already in use.",
      fields: { slug: ["That vendor URL is already in use."] },
    });
    render(createElement(AddVendorDialog, { onClose: vi.fn(), onCreated: vi.fn() }));
    await fillAndSubmit();
    const slug = screen.getByRole("textbox", { name: /vendor url/i });
    await waitFor(() => expect(slug).toHaveFocus());
    expect(slug).toHaveAccessibleDescription(/already in use/i);
  });

  it("focuses the duplicate owner email field", async () => {
    stubFailure(409, {
      code: "DUPLICATE",
      message: "That email already has an account.",
      fields: { ownerEmail: ["That email already has an account."] },
    });
    render(createElement(AddVendorDialog, { onClose: vi.fn(), onCreated: vi.fn() }));
    await fillAndSubmit();
    const email = screen.getByRole("textbox", { name: /owner email/i });
    await waitFor(() => expect(email).toHaveFocus());
  });

  it("focuses the error summary for a non-field failure", async () => {
    stubFailure(500, { code: "SERVER", message: "The vendor could not be created." });
    render(createElement(AddVendorDialog, { onClose: vi.fn(), onCreated: vi.fn() }));
    await fillAndSubmit();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });
});

describe("admin status dialog (AUD-22)", () => {
  it("opens with focus on Cancel, not on the destructive confirm", async () => {
    render(
      createElement(VendorStatusDialog, {
        vendor: makeAdminVendor(),
        onClose: vi.fn(),
        onSaved: vi.fn(),
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  // Intended change (AUD-22): destructive confirmations are alertdialogs.
  it("is an alertdialog that states the consequence of suspending", async () => {
    render(
      createElement(VendorStatusDialog, {
        vendor: makeAdminVendor(),
        onClose: vi.fn(),
        onSaved: vi.fn(),
      }),
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Suspend vendor" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/stop new kiosk orders/i);
    expect(dialog).toHaveTextContent(/preserved/i);
  });

  it("returns focus to the opener after Escape", async () => {
    render(createElement(AdminPortal, { initialData: makeAdminBootstrap() }));
    const opener = screen.getAllByRole("button", { name: /suspend chapega\.com/i })[0];
    await userEvent.click(opener);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns focus to a stable region when the opener was removed", async () => {
    const data = makeAdminBootstrap();
    stubFailure(500, { code: "SERVER", message: "x" });
    render(createElement(AdminPortal, { initialData: data }));
    const opener = screen.getAllByRole("button", { name: /suspend chapega\.com/i })[0];
    await userEvent.click(opener);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    // The opener disappears (for example the list re-renders); closing must not drop focus to <body>.
    opener.remove();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  });
});

describe("admin route error boundary (AUD-22)", () => {
  it("announces the failure and offers a retry", async () => {
    const retry = vi.fn();
    render(createElement(AdminError, { error: new Error("boom"), retry }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/could not load/i);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
