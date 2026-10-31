import "server-only";

import type { FieldErrors } from "@/server/vendor/errors";

export class AdminServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Per-field messages, shown next to the form fields they belong to. */
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = "AdminServiceError";
  }
}
