import "server-only";

export class AdminServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminServiceError";
  }
}
