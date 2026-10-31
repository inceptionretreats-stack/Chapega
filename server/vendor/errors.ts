export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export class VendorServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Per-field messages, shown next to the form fields they belong to. */
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = "VendorServiceError";
  }
}

/** A 400 for one form field, e.g. a new password the policy refuses. */
export function fieldError(field: string, code: string, message: string): VendorServiceError {
  return new VendorServiceError(400, code, message, { [field]: [message] });
}
