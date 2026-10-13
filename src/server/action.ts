import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { AppError, conflict, isAppError, notFound } from "@/lib/errors";
import type { Actor } from "@/server/auth/actor";
import { requireActorOrThrow } from "@/server/auth/session";

type ActionOutcome<T> = {
  message?: string;
  data?: T;
  redirectTo?: string;
  /** Paths whose server-rendered data changed. */
  revalidate?: string[];
};

/** Translate known database errors into user-safe AppErrors. */
export function mapDatabaseError(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return conflict("A record with these details already exists.");
    if (error.code === "P2003" || error.code === "P2014") {
      return conflict("This record is linked to other records and cannot be changed or removed.");
    }
    if (error.code === "P2025") return notFound("Record");
  }
  return null;
}

/**
 * Wrap a server action: authenticate + role-check, run, revalidate, and convert
 * failures into a safe ActionResult. Unexpected errors are logged on the server only;
 * the client receives a generic message (no stack traces or internals).
 */
export async function runAction<T = undefined>(
  roles: Role[],
  fn: (actor: Actor) => Promise<ActionOutcome<T>>,
): Promise<ActionResult<T>> {
  try {
    const actor = await requireActorOrThrow(...roles);
    const outcome = await fn(actor);
    for (const path of outcome.revalidate ?? []) revalidatePath(path);
    return { ok: true, message: outcome.message, data: outcome.data, redirectTo: outcome.redirectTo };
  } catch (error) {
    const appError = isAppError(error) ? error : mapDatabaseError(error);
    if (appError) return { ok: false, error: appError.message, fieldErrors: appError.fieldErrors };
    console.error("[server action] unexpected error:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
