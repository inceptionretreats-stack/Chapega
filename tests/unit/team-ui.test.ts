// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VendorTeamMember } from "@/types/vendor";

const client = vi.hoisted(() => ({ vendorRequest: vi.fn(), adminRequest: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/image", async () => {
  const React = await import("react");
  return {
    default: ({ src, alt = "" }: { src: string; alt?: string }) =>
      React.createElement("img", { src, alt }),
  };
});
vi.mock("@/components/vendor/vendor-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/vendor/vendor-client")>()),
  vendorRequest: client.vendorRequest,
}));
vi.mock("@/components/admin/admin-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/admin-client")>()),
  adminRequest: client.adminRequest,
}));

import { ResetOwnerPasswordDialog } from "@/components/admin/reset-owner-password-dialog";
import { VendorClientError } from "@/components/vendor/vendor-client";
import { VendorPasswordForm } from "@/components/vendor/vendor-password-form";
import { VendorPortal } from "@/components/vendor/vendor-portal";
import { VendorTeam } from "@/components/vendor/vendor-team";
import { makeAdminVendor } from "./admin-fixtures";
import { makeBootstrap } from "./portal-fixtures";

function member(overrides: Partial<VendorTeamMember> = {}): VendorTeamMember {
  return {
    userId: "staff-1",
    name: "Ravi",
    email: "ravi@example.test",
    role: "staff",
    active: true,
    passwordChangePending: false,
    isCurrentUser: false,
    canManage: true,
    canResetPassword: true,
    memberSince: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const owner = member({
  userId: "owner-1",
  name: "Aanya",
  email: "owner@example.test",
  role: "owner",
  isCurrentUser: true,
  canManage: false,
  canResetPassword: false,
});

beforeEach(() => {
  client.vendorRequest.mockReset();
  client.adminRequest.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

function renderTeam(members: VendorTeamMember[]) {
  client.vendorRequest.mockResolvedValueOnce({ members });
  const onToast = vi.fn();
  render(
    createElement(VendorTeam, {
      apiBase: "/api/vendor/chapega",
      shopName: "Chapega.com",
      onToast,
      onSessionEnded: vi.fn(),
    }),
  );
  return { onToast };
}

describe("Studio team view", () => {
  it("lists people, leaving owners and the current user read-only", async () => {
    renderTeam([
      owner,
      member(),
      member({
        userId: "shared-1",
        name: "Meera",
        email: "meera@example.test",
        canResetPassword: false,
      }),
    ]);
    const ravi = (await screen.findByText("ravi@example.test")).closest("li")!;
    expect(within(ravi).getByRole("combobox", { name: "Role for Ravi" })).toHaveValue("staff");
    const ownerRow = screen.getByText("owner@example.test").closest("li")!;
    expect(within(ownerRow).queryByRole("combobox")).toBeNull();
    expect(within(ownerRow).getByText("You")).toBeInTheDocument();
    const meera = screen.getByText("Meera").closest("li")!;
    expect(within(meera).queryByRole("button", { name: /temporary password/ })).toBeNull();
    expect(within(meera).getByText(/change their own password/)).toBeInTheDocument();
  });

  it("changes a role straight away", async () => {
    const user = userEvent.setup();
    const { onToast } = renderTeam([owner, member()]);
    client.vendorRequest.mockResolvedValueOnce({ member: member({ role: "manager" }) });
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Role for Ravi" }),
      "manager",
    );
    expect(client.vendorRequest).toHaveBeenLastCalledWith("/api/vendor/chapega/team/staff-1", {
      method: "PATCH",
      body: JSON.stringify({ role: "manager" }),
    });
    await waitFor(() => expect(onToast).toHaveBeenCalledWith("Ravi is now manager."));
  });

  it("asks before removing access, opening on the safe choice", async () => {
    const user = userEvent.setup();
    renderTeam([owner, member()]);
    await user.click(await screen.findByRole("button", { name: "Remove access for Ravi" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove Ravi's access?" });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Keep access" })).toHaveFocus(),
    );
    client.vendorRequest.mockResolvedValueOnce({ member: member({ active: false }) });
    await user.click(within(dialog).getByRole("button", { name: "Remove access" }));
    expect(client.vendorRequest).toHaveBeenLastCalledWith("/api/vendor/chapega/team/staff-1", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    await waitFor(() => expect(screen.getByText("No access")).toBeInTheDocument());
  });

  it("adds a member and shows the details to hand over", async () => {
    const user = userEvent.setup();
    renderTeam([owner]);
    await user.click(await screen.findByRole("button", { name: "Add team member" }));
    const dialog = screen.getByRole("dialog", { name: "Add a team member" });
    await user.type(within(dialog).getByLabelText("Name"), "Asha");
    await user.type(within(dialog).getByLabelText("Email"), "asha@example.test");
    await user.click(within(dialog).getByRole("button", { name: "Generate" }));
    const password = within(dialog).getByLabelText("Temporary password") as HTMLInputElement;
    expect(password.value).toMatch(/^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);

    client.vendorRequest.mockRejectedValueOnce(
      new VendorClientError(409, "EMAIL_UNAVAILABLE", "This email address can't be used.", {
        email: ["This email address can't be used."],
      }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Add to team" }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Email")).toHaveAttribute("aria-invalid", "true"),
    );

    client.vendorRequest.mockResolvedValueOnce({
      member: member({ userId: "asha-1", name: "Asha", email: "asha@example.test" }),
    });
    await user.click(within(dialog).getByRole("button", { name: "Add to team" }));
    const done = await screen.findByRole("dialog", { name: "Asha was added" });
    expect(done).toHaveTextContent(password.value);
  });
});

describe("change password form", () => {
  it("checks the confirmation before sending anything", async () => {
    const user = userEvent.setup();
    render(
      createElement(VendorPasswordForm, {
        apiBase: "/api/vendor/chapega",
        email: "owner@example.test",
        idPrefix: "test",
        submitLabel: "Change password",
        onChanged: vi.fn(),
        onSessionEnded: vi.fn(),
      }),
    );
    await user.type(screen.getByLabelText("Current password"), "old password here");
    await user.type(screen.getByLabelText("New password"), "violet trams hum past midnight");
    await user.type(screen.getByLabelText("Confirm new password"), "something else entirely");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(client.vendorRequest).not.toHaveBeenCalled();
    expect(screen.getByText("The new passwords don't match.")).toBeInTheDocument();
  });

  it("shows a wrong current password next to that field", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(
      createElement(VendorPasswordForm, {
        apiBase: "/api/vendor/chapega",
        email: "owner@example.test",
        idPrefix: "test",
        submitLabel: "Change password",
        onChanged,
        onSessionEnded: vi.fn(),
      }),
    );
    client.vendorRequest.mockRejectedValueOnce(
      new VendorClientError(
        400,
        "CURRENT_PASSWORD_INCORRECT",
        "That is not your current password.",
        {
          currentPassword: ["That is not your current password."],
        },
      ),
    );
    await user.type(screen.getByLabelText("Current password"), "wrong");
    await user.type(screen.getByLabelText("New password"), "violet trams hum past midnight");
    await user.type(
      screen.getByLabelText("Confirm new password"),
      "violet trams hum past midnight",
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("Studio navigation", () => {
  it("shows Team to owners only", () => {
    const { unmount } = render(createElement(VendorPortal, { initialData: makeBootstrap() }));
    const sidebar = screen.getByRole("complementary", { name: "Vendor Studio navigation" });
    expect(within(sidebar).getByRole("button", { name: "Team" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Change password" })).toBeInTheDocument();
    unmount();

    const manager = makeBootstrap();
    const capabilities = { ...manager.capabilities, manage_team: false, manage_settings: false };
    render(
      createElement(VendorPortal, {
        initialData: { ...manager, capabilities, user: { ...manager.user, capabilities } },
      }),
    );
    const managerSidebar = screen.getByRole("complementary", { name: "Vendor Studio navigation" });
    expect(within(managerSidebar).queryByRole("button", { name: "Team" })).toBeNull();
  });
});

describe("admin owner password reset", () => {
  it("sends the owner and a temporary password, then shows what to hand over", async () => {
    const user = userEvent.setup();
    const vendor = makeAdminVendor();
    const onReset = vi.fn();
    client.adminRequest.mockResolvedValueOnce({ vendor, metrics: {}, activity: {} });
    render(
      createElement(ResetOwnerPasswordDialog, {
        vendor,
        onClose: vi.fn(),
        onReset,
        onSessionEnded: vi.fn(),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Generate" }));
    const password = (screen.getByLabelText("Temporary password") as HTMLInputElement).value;
    await user.click(screen.getByRole("button", { name: "Set temporary password" }));
    expect(client.adminRequest).toHaveBeenCalledWith(
      `/api/admin/vendors/${vendor.id}/owner-password`,
      {
        method: "POST",
        body: JSON.stringify({ ownerId: vendor.owner.id, temporaryPassword: password }),
      },
    );
    await waitFor(() => expect(onReset).toHaveBeenCalled());
    expect(await screen.findByText(password)).toBeInTheDocument();
  });
});
