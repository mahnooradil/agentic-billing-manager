/**
 * Operational error carrying an HTTP status code and optional field errors.
 *
 * Thrown anywhere in the request lifecycle and translated into a consistent
 * JSON body by the central error handler. "Operational" = an expected failure
 * (bad input, unauthorized, duplicate, …), as opposed to a programmer bug.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errors?: string[];
  public readonly isOperational = true;

  constructor(message: string, statusCode = 500, errors?: string[]) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    // Restore the prototype chain (required when extending built-ins in TS).
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
