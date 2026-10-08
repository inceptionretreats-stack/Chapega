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
