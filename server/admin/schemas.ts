import "server-only";

import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(200),
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
  temporaryPassword: z
    .string()
    .min(12)
    .max(200)
    .refine((value) => /[a-z]/.test(value), "Add a lowercase letter.")
    .refine((value) => /[A-Z]/.test(value), "Add an uppercase letter.")
    .refine((value) => /\d/.test(value), "Add a number."),
});

export const updateAdminVendorStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  revision: z.number().int().min(1),
});

export const adminVendorIdSchema = z.string().uuid();
