// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog";

const originalGetClientRects = Element.prototype.getClientRects;

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  // jsdom has no layout, so every element reports zero client rects and the
  // focus trap would treat nothing as focusable. Report one box per element.
  Element.prototype.getClientRects = function getClientRects() {
    return [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
  };
});

afterEach(() => {
  Element.prototype.getClientRects = originalGetClientRects;
  cleanup();
});

type HarnessProps = {
  onConfirm?: () => void;
  pending?: boolean;
};

/** A trigger that opens the dialog, so focus return can be observed. */
function Harness({ onConfirm = vi.fn(), pending = false }: HarnessProps) {
  const [open, setOpen] = useState(false);
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: () => setOpen(true) }, "Archive"),
    open
      ? createElement(ConfirmDialog, {
          title: "Archive this product?",
          description: "It disappears from the kiosk. This cannot be undone here.",
          confirmLabel: "Archive product",
          pendingLabel: "Archiving…",
          pending,
          onConfirm,
          onCancel: () => setOpen(false),
        })
      : null,
  );
}

async function openDialog(props: HarnessProps = {}) {
  render(createElement(Harness, props));
  const trigger = screen.getByRole("button", { name: "Archive" });
  await userEvent.click(trigger);
  const dialog = await screen.findByRole("alertdialog");
  return { trigger, dialog };
}

describe("ConfirmDialog (AUD-22)", () => {
  it("is an alertdialog named by its title and described by the consequence", async () => {
    const { dialog } = await openDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Archive this product?");
    expect(dialog).toHaveAccessibleDescription(/cannot be undone/i);
  });

  it("focuses Cancel, not the destructive action, when it opens", async () => {
    await openDialog();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  it("closes on Escape and returns focus to the control that opened it", async () => {
    const { trigger } = await openDialog();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes from Cancel and returns focus to the trigger", async () => {
    const { trigger } = await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    await openDialog();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Archive product" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await userEvent.tab();
    expect(confirm).toHaveFocus();
    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it("calls the action only when the confirm button is used", async () => {
    const onConfirm = vi.fn();
    await openDialog({ onConfirm });
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Archive product" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cannot be dismissed while the action is pending", async () => {
    const { dialog } = await openDialog({ pending: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archiving…" })).toBeDisabled();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
