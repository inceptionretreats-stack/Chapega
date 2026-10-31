import "server-only";

import { formatInr } from "@/domain/money";
import { logger, serializeError } from "@/server/observability/logger";
import { getPushConfiguration } from "@/server/push/config";
import { deliverFcmMessage, type FcmMessage } from "@/server/push/fcm";
import { claimOrderPushTargets, finishOrderPush } from "@/server/push/registrations";
import type { VendorOrder } from "@/types/vendor";

/** The Android channel the Chapega Studio app creates for these. */
export const ORDER_ALERT_CHANNEL_ID = "new_orders";

const SEND_CONCURRENCY = 8;
const OVERALL_DEADLINE_MS = 10_000;
const MESSAGE_LIFETIME_SECONDS = 3_600;

/**
 * The notification for one phone. Only the order number, total and item
 * count: never the customer's name, phone, notes, or the WhatsApp message,
 * because lock screens and Google's servers see it.
 */
export function orderAlertMessage(
  fcmToken: string,
  vendorSlug: string,
  order: Pick<VendorOrder, "id" | "orderNumber" | "totalPaise"> &
    Readonly<{ items: readonly Readonly<{ quantity: number }>[] }>,
  nowSeconds = Math.floor(Date.now() / 1000),
): FcmMessage {
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  return {
    token: fcmToken,
    notification: {
      title: "New kiosk order",
      body: `${order.orderNumber} · ${formatInr(order.totalPaise)} · ${itemCount} ${itemCount === 1 ? "item" : "items"}`,
    },
    data: {
      type: "order.created",
      vendorSlug,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalPaise: String(order.totalPaise),
      itemCount: String(itemCount),
    },
    android: {
      priority: "high",
      ttl: `${MESSAGE_LIFETIME_SECONDS}s`,
      // The tag makes a repeat replace, not add to, the notification.
      notification: { channel_id: ORDER_ALERT_CHANNEL_ID, tag: order.id },
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
        "apns-collapse-id": order.id,
        "apns-expiration": String(nowSeconds + MESSAGE_LIFETIME_SECONDS),
      },
      payload: { aps: { sound: "default", "thread-id": vendorSlug } },
    },
  };
}

async function inBatches<T, R>(
  items: readonly T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(run))));
  }
  return results;
}

/**
 * Tell the shop's signed-in phones about a new kiosk order. Runs after the
 * kiosk has its answer; never throws. Each order is claimed in the database
 * first, so it is announced at most once.
 */
export async function notifyNewKioskOrder(
  vendor: Readonly<{ id: string; slug: string }>,
  order: VendorOrder,
): Promise<void> {
  const configuration = getPushConfiguration();
  if (!configuration) return;
  const startedAt = Date.now();
  try {
    const targets = await claimOrderPushTargets(vendor.id, order.id);
    if (!targets || targets.length === 0) return;
    const deadline = startedAt + OVERALL_DEADLINE_MS;
    const deliveries = await inBatches(targets, SEND_CONCURRENCY, async (target) => ({
      target,
      delivery: await deliverFcmMessage(
        configuration,
        orderAlertMessage(target.token, vendor.slug, order),
        deadline,
      ),
    }));
    const sent = deliveries.filter(({ delivery }) => delivery === "sent").length;
    const failed = deliveries.filter(({ delivery }) => delivery === "failed").length;
    const unregistered = deliveries
      .filter(({ delivery }) => delivery === "unregistered")
      .map(({ target }) => target.tokenHash);
    const cleared = await finishOrderPush(vendor.id, order.id, { sent, failed, unregistered });
    logger.info("push.order_alert", {
      vendorId: vendor.id,
      orderId: order.id,
      phones: targets.length,
      sent,
      failed,
      cleared,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.warn("push.order_alert_failed", {
      vendorId: vendor.id,
      orderId: order.id,
      error: serializeError(error),
    });
  }
}
