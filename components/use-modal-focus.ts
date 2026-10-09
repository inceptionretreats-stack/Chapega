"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

// Open modals, innermost last. Only the top modal handles Escape and Tab, so
// a confirmation stacked over the product editor closes on its own.
const modalStack: symbol[] = [];

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0,
  );
}

export function useModalFocus<TContainer extends HTMLElement, TInitial extends HTMLElement>(
  containerRef: RefObject<TContainer | null>,
  initialFocusRef: RefObject<TInitial | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const token = Symbol("modal");
    modalStack.push(token);

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      // A field reached before this frame keeps focus: moving it would send
      // the next keystrokes somewhere else.
      if (container.contains(document.activeElement)) return;
      const preferredFocus = initialFocusRef.current;
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      const preferredFocusOpensKeyboard = preferredFocus?.matches(
        "input, textarea, select, [contenteditable='true']",
      );
      const initialFocus =
        coarsePointer && preferredFocusOpensKeyboard
          ? container
          : (preferredFocus ?? getFocusableElements(container)[0] ?? container);
      initialFocus.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(container);
      if (!focusableElements.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusIsOutside = !(activeElement instanceof Node) || !container.contains(activeElement);

      if (event.shiftKey && (focusIsOutside || activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focusIsOutside || activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      const index = modalStack.lastIndexOf(token);
      if (index !== -1) modalStack.splice(index, 1);
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [containerRef, initialFocusRef]);
}
