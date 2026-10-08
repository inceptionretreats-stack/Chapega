import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/global-error";

type ElementLike = {
  type: unknown;
  props: { children?: unknown; onClick?: () => void };
};

function findButton(node: unknown): ElementLike | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child);
      if (found) return found;
    }
    return null;
  }
  const element = node as ElementLike;
  if (element.type === "button") return element;
  return findButton(element.props?.children);
}

describe("app/global-error.tsx", () => {
  const error = Object.assign(new Error("Server Components render failed"), {
    digest: "4040404040",
  });

  it("renders its own document with a recovery action and the error reference", () => {
    const markup = renderToStaticMarkup(
      createElement(GlobalError, { error, retry: () => undefined }),
    );

    expect(markup).toMatch(/^<html[^>]*lang="en"/);
    expect(markup).toContain("<body");
    expect(markup).toContain("Try again");
    expect(markup).toContain("4040404040");
    // The production error message is never echoed to customers.
    expect(markup).not.toContain("Server Components render failed");
  });

  it("calls the Next.js retry callback", () => {
    const retry = vi.fn();
    const tree = GlobalError({ error, retry });
    const button = findButton(tree);

    expect(button).not.toBeNull();
    button?.props.onClick?.();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
