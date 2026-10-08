// @vitest-environment jsdom

import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VendorLoginForm } from "@/components/vendor/vendor-login-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("vendor login hydration (AUD-39)", () => {
  it("keeps values typed before hydration and still pre-fills preview credentials", async () => {
    const element = createElement(VendorLoginForm, {
      authenticationAvailable: true,
      previewCredentials: { email: "owner@chapega.com", password: "Chapega@2026" },
    });
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);

    const email = container.querySelector<HTMLInputElement>("#vendor-email")!;
    const password = container.querySelector<HTMLInputElement>("#vendor-password")!;
    // Preview helper: server markup carries the preview credentials.
    expect(email.value).toBe("owner@chapega.com");
    // The user types before hydration finishes.
    email.value = "typed@example.com";
    password.value = "typed-password";

    await act(async () => {
      hydrateRoot(container, element);
    });

    expect(email.value).toBe("typed@example.com");
    expect(password.value).toBe("typed-password");

    // Any later re-render (here: the show-password toggle) must not restore
    // the preview values over what the user typed.
    const toggle = container.querySelector<HTMLButtonElement>(".vendor-password-toggle")!;
    await act(async () => {
      toggle.click();
    });
    expect(container.querySelector<HTMLInputElement>("#vendor-email")!.value).toBe(
      "typed@example.com",
    );
    expect(container.querySelector<HTMLInputElement>("#vendor-password")!.value).toBe(
      "typed-password",
    );
  });
});
