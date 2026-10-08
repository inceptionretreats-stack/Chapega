// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PRESENTER_SETTINGS,
  useKioskStore,
} from "@/store/kiosk-store";
import type { Order } from "@/types/kiosk";

const ORDER = {
  id: "6f1c3a52-8d3e-4b7a-9c1e-0a5b2d4e7f90",
  orderNumber: "GFT-20261008-123456",
  customerName: "Asha",
  customerPhone: "9876543210",
} as unknown as Order;

/** Mirrors the one-second interval kiosk-app.tsx runs while the QR is shown. */
function runQrScreenFor(seconds: number) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    vi.advanceTimersByTime(1_000);
    useKioskStore.getState().tickCountdown();
  }
}

describe("QR privacy countdown (AUD-17)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    useKioskStore.getState().resetSession();
    useKioskStore.setState({
      settings: { ...DEFAULT_PRESENTER_SETTINGS, qrResetSeconds: 120 },
      screen: "qr",
      currentOrder: ORDER,
      customer: {
        customerName: "Asha",
        customerPhone: "9876543210",
        giftNote: "",
        orderNote: "",
      },
      countdownSeconds: 120,
    });
  });
  afterEach(() => {
    useKioskStore.getState().resetSession();
    vi.useRealTimers();
  });

  it("extends the countdown by one full period instead of pausing it forever", () => {
    runQrScreenFor(100);
    expect(useKioskStore.getState().countdownSeconds).toBe(20);

    useKioskStore.getState().keepQrOpen();
    expect(useKioskStore.getState().countdownSeconds).toBe(140);

    // The countdown keeps running and the screen still ends the session.
    runQrScreenFor(139);
    expect(useKioskStore.getState().screen).toBe("qr");
    expect(useKioskStore.getState().countdownSeconds).toBe(1);
    runQrScreenFor(1);
    const after = useKioskStore.getState();
    expect(after.screen).toBe("welcome");
    expect(after.currentOrder).toBeNull();
    expect(after.customer.customerName).toBe("");
    expect(after.customer.customerPhone).toBe("");
  });

  it("only extends once per prepared order", () => {
    useKioskStore.getState().keepQrOpen();
    useKioskStore.getState().keepQrOpen();
    useKioskStore.getState().keepQrOpen();
    expect(useKioskStore.getState().countdownSeconds).toBe(240);
    expect(useKioskStore.getState().qrExtended).toBe(true);
  });

  it("never lets the total time on the QR screen exceed five minutes", () => {
    useKioskStore.setState({
      settings: { ...DEFAULT_PRESENTER_SETTINGS, qrResetSeconds: 600 },
      countdownSeconds: 600,
    });
    useKioskStore.getState().keepQrOpen();
    expect(useKioskStore.getState().countdownSeconds).toBe(600);

    useKioskStore.setState({ qrExtended: false, countdownSeconds: 200 });
    useKioskStore.getState().keepQrOpen();
    expect(useKioskStore.getState().countdownSeconds).toBe(300);
  });

  it("does not carry the extension over to the next order", () => {
    useKioskStore.getState().keepQrOpen();
    useKioskStore.getState().resetSession();
    expect(useKioskStore.getState().qrExtended).toBe(false);
  });
});
