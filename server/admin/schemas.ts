import "server-only";

import { z } from "zod";
import { newPasswordProblem } from "@/server/security/password-policy";

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(200),
});

/**
 * New temporary passwords follow the NIST-based policy in
 * server/security/password-policy.ts (15-128 characters, no composition
 * rules, common/published values refused). Sign-in schemas keep accepting
 * existing shorter passwords.
 */
const newPasswordSchema = z.string().superRefine((value, context) => {
  const problem = newPasswordProblem(value);
  if (problem) context.addIssue({ code: "custom", message: problem });
});

/**
 * Slugs that would collide with fixed routes beside a [vendorSlug] segment
 * (/vendor/login, /api/vendor/products, /api/kiosk/bootstrap, …) or with
 * top-level and operational paths. A shop with one of these slugs would
 * render the static route instead of its Studio or kiosk.
 */
export const RESERVED_VENDOR_SLUGS: ReadonlySet<string> = new Set([
  // Static siblings of [vendorSlug] in app/vendor, app/api/vendor, app/api/kiosk
  "login",
  "logout",
  "select",
  "bootstrap",
  "orders",
  "products",
  "settings",
  "uploads",
  // Top-level route segments and API namespaces
  "admin",
  "api",
  "kiosk",
  "vendor",
  "vendors",
  "vendor-products",
  "healthz",
  "readyz",
  "generated-products",
  // Reserved for platform features and well-known paths
  "account",
  "accounts",
  "assets",
  "auth",
  "chapega",
  "dashboard",
  "help",
  "new",
  "null",
  "platform",
  "public",
  "register",
  "signin",
  "signup",
  "static",
  "status",
  "studio",
  "support",
  "system",
  "team",
  "undefined",
  "www",
]);

export const createAdminVendorSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(63)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens.",
    )
    .refine(
      (value) => !RESERVED_VENDOR_SLUGS.has(value),
      "This web address is reserved by Chapega. Choose another one.",
    ),
  ownerName: z.string().trim().min(2).max(80),
  ownerEmail: z.string().trim().toLowerCase().email().max(160),
  ownerWhatsAppNumber: z.string().trim().min(8).max(24),
  temporaryPassword: newPasswordSchema,
}).superRefine((value, context) => {
  // Context-free problems were already reported on the field itself.
  if (newPasswordProblem(value.temporaryPassword)) return;
  const problem = newPasswordProblem(value.temporaryPassword, {
    email: value.ownerEmail,
    name: value.ownerName,
  });
  if (problem) {
    context.addIssue({ code: "custom", path: ["temporaryPassword"], message: problem });
  }
});

const vendorStatusSchema = z.enum(["active", "suspended"]);

/**
 * Status changes are guarded by the status itself, not by vendor.revision
 * (which every product edit and kiosk order bumps). `expectedStatus` is the
 * status the admin saw; when omitted it is the opposite of the target.
 * `revision` is still accepted from existing clients but no longer compared.
 */
export const updateAdminVendorStatusSchema = z
  .object({
    status: vendorStatusSchema,
    expectedStatus: vendorStatusSchema.optional(),
    revision: z.number().int().min(1).optional(),
  })
  .refine((value) => value.expectedStatus !== value.status, {
    path: ["expectedStatus"],
    message: "The vendor is already in that status.",
  });

export const adminVendorIdSchema = z.string().uuid();
