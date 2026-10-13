import { NextResponse } from "next/server";
import { checkSecretStrength } from "@/server/auth/secret";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + configuration + database connectivity check, used by the Docker health check.
 * Reveals no configuration details: an unusable BETTER_AUTH_SECRET (the app would reject
 * every sign-in) only reports `config: "invalid"`.
 */
export async function GET() {
  if (checkSecretStrength(process.env.BETTER_AUTH_SECRET)) {
    return NextResponse.json({ status: "error", config: "invalid" }, { status: 503 });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "up" });
  } catch {
    return NextResponse.json({ status: "error", database: "down" }, { status: 503 });
  }
}
