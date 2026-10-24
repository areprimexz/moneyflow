export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(error: string, code?: string): Result<T> {
  return { ok: false, error, code };
}

/** Domain error thrown inside services; mapped to HTTP 4xx by the API layer. */
export class DomainError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code = "invalid_request", status = 400) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new DomainError(result.error, result.code);
  return result.value;
}
