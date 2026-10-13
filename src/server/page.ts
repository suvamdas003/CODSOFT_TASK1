import "server-only";
import { notFound, redirect } from "next/navigation";
import { isAppError } from "@/lib/errors";

/**
 * Await a service call from a page. Authorization and lookup failures become the
 * appropriate navigation (404, access denied, login) instead of an error page.
 * Unexpected errors propagate to the error boundary.
 */
export async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === "UNAUTHENTICATED") redirect("/login");
      if (error.code === "FORBIDDEN") redirect("/access-denied");
      if (error.code === "NOT_FOUND" || error.code === "VALIDATION") notFound();
    }
    throw error;
  }
}
