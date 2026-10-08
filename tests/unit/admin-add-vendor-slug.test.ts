// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddVendorDialog } from "@/components/admin/add-vendor-dialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(onCreated = vi.fn()) {
  render(createElement(AddVendorDialog, { onClose: vi.fn(), onCreated }));
  return {
    name: screen.getByRole("textbox", { name: /vendor name/i }),
    slug: screen.getByRole("textbox", { name: /vendor url/i }),
  };
}

describe("add-vendor slug field (AUD-40)", () => {
  it("lets a hyphenated slug be typed and normalises it on blur", async () => {
    const { slug } = renderDialog();
    await userEvent.type(slug, "my-shop");
    expect(slug).toHaveValue("my-shop");

    await userEvent.clear(slug);
    await userEvent.type(slug, "my-");
    expect(slug).toHaveValue("my-");
    await userEvent.tab();
    expect(slug).toHaveValue("my");
  });

  it("resumes deriving the slug from the name after the slug is cleared", async () => {
    const { name, slug } = renderDialog();
    await userEvent.type(name, "Blue Door");
    expect(slug).toHaveValue("blue-door");

    await userEvent.clear(slug);
    await userEvent.type(slug, "custom");
    await userEvent.type(name, " Gifts");
    expect(slug).toHaveValue("custom");

    await userEvent.clear(slug);
    await userEvent.type(name, "!");
    expect(slug).toHaveValue("blue-door-gifts");
  });

  it("shows a server slug error (for example a reserved slug) on the slug field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "VALIDATION_ERROR",
              message: "Check the highlighted information and try again.",
              fields: { slug: ["That vendor URL is reserved."] },
            },
          }),
          { status: 400 },
        ),
      ),
    );
    const { name, slug } = renderDialog();
    await userEvent.type(name, "Admin");
    await userEvent.type(screen.getByRole("textbox", { name: /owner name/i }), "Asha");
    await userEvent.type(screen.getByRole("textbox", { name: /owner email/i }), "asha@example.com");
    await userEvent.type(screen.getByRole("textbox", { name: /whatsapp/i }), "9876543210");
    await userEvent.type(screen.getByLabelText(/temporary password/i), "Sufficient-Pass-123");
    await userEvent.click(screen.getByRole("button", { name: /create vendor/i }));

    await waitFor(() => expect(slug).toHaveAccessibleDescription(/reserved/i));
    expect(slug).toBeInvalid();
  });
});
