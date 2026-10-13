import type { z } from "zod";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT";

export type FieldErrors = Record<string, string[] | undefined>;

/**
 * Expected, user-safe failure. Its message may be shown to the user; anything else
 * thrown is treated as an internal error and replaced by a generic message.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Please sign in to continue.");
export const forbidden = (message = "You do not have permission to perform this action.") =>
  new AppError("FORBIDDEN", message);
export const notFound = (entity: string) => new AppError("NOT_FOUND", `${entity} was not found.`);
export const conflict = (message: string, fieldErrors?: FieldErrors) => new AppError("CONFLICT", message, fieldErrors);
export const invalid = (message: string, fieldErrors?: FieldErrors) => new AppError("VALIDATION", message, fieldErrors);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Validate untrusted input against a schema or throw a VALIDATION AppError with field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw invalid("Please correct the highlighted fields.", fieldErrors);
}
