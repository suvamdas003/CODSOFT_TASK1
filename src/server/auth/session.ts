import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { forbidden, unauthenticated } from "@/lib/errors";
import { prisma } from "@/server/db";
import type { Actor } from "./actor";
import { auth } from "./auth";

/**
 * Resolve the current request's Actor from the session cookie. The user row is
 * re-read on every request so role changes and deactivation take effect immediately.
 * Memoized per request with React cache().
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      studentProfile: { select: { id: true } },
      teacherProfile: { select: { id: true } },
    },
  });
  if (!user || !user.isActive) return null;

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentProfile?.id ?? null,
    teacherId: user.teacherProfile?.id ?? null,
  };
});

/** For pages and layouts: redirect to /login when signed out, /access-denied for wrong role. */
export async function requireActor(...roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (roles.length > 0 && !roles.includes(actor.role)) redirect("/access-denied");
  return actor;
}

/** For server actions and route handlers: throw AppErrors instead of redirecting. */
export async function requireActorOrThrow(...roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw unauthenticated();
  if (roles.length > 0 && !roles.includes(actor.role)) throw forbidden();
  return actor;
}
