import { normalizeWhatsAppNumber } from "@/domain/whatsapp";
import { loadKioskShop } from "./kiosk/shop-status";

export type ShopContact = Readonly<{
  slug: string;
  shopName: string;
  whatsAppDigits: string;
}>;

/**
 * A shop's name and WhatsApp number from its live settings, for the pages
 * that tell people where to send a request. Null when the shop is unknown,
 * suspended, or has no valid number.
 */
export async function loadShopContact(
  rawShop: string | string[] | undefined,
): Promise<ShopContact | null> {
  const candidate = Array.isArray(rawShop) ? rawShop[0] : rawShop;
  if (!candidate) return null;
  const shop = await loadKioskShop(candidate);
  if (shop.status !== "ok") return null;
  const { settings, vendor } = shop.bootstrap;
  try {
    return {
      slug: vendor.slug,
      shopName: settings.shopName,
      whatsAppDigits: normalizeWhatsAppNumber(
        settings.ownerWhatsAppNumber,
        settings.defaultCountryCode,
      ),
    };
  } catch {
    return null;
  }
}
