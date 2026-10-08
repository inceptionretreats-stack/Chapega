// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddVendorDialog } from "@/components/admin/add-vendor-dialog";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { VendorLoginForm } from "@/components/vendor/vendor-login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

async function expectToggleCycle(password: HTMLElement) {
  const toggle = screen.getByRole("button", { name: "Show password" });
  // One stable name; the state is carried by aria-pressed.
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(toggle).toHaveAttribute("aria-controls", password.id);
  expect(password).toHaveAttribute("type", "password");

  await userEvent.click(toggle);
  expect(password).toHaveAttribute("type", "text");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle).toHaveAccessibleName("Show password");
  expect(toggle).toHaveFocus();

  // Keyboard activation keeps focus on the toggle as well.
  await userEvent.keyboard(" ");
  expect(password).toHaveAttribute("type", "password");
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(toggle).toHaveFocus();
}

describe("password show/hide toggle (AUD-32)", () => {
  it("is on the add-vendor owner password", async () => {
    render(createElement(AddVendorDialog, { onClose: vi.fn(), onCreated: vi.fn() }));
    const password = screen.getByLabelText("Temporary password");
    await userEvent.type(password, "Sufficient-Pass-123");
    await expectToggleCycle(password);
    expect(password).toHaveValue("Sufficient-Pass-123");
  });

  it("is the same control on the vendor sign-in form", async () => {
    render(createElement(VendorLoginForm, { authenticationAvailable: true, previewCredentials: null }));
    await expectToggleCycle(screen.getByLabelText("Password"));
  });

  it("is the same control on the admin sign-in form", async () => {
    render(createElement(AdminLoginForm, { authenticationAvailable: true, previewCredentials: null }));
    await expectToggleCycle(screen.getByLabelText("Password"));
  });
});
