import type { Db } from "@/server/db";

/**
 * Per-account limit on failed sign-ins, stored in the rate_limits table next to Better
 * Auth's per-IP counters. The per-IP limit keys on X-Forwarded-For, which a client that
 * reaches the app directly can change on every request; this limit cannot be bypassed
 * that way. Only existing accounts are tracked, so random emails create no rows.
 */
export const FAILED_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export function failedSignInLimit(): number {
  return Number.parseInt(process.env.AUTH_SIGNIN_ACCOUNT_LIMIT_MAX ?? "", 10) || 10;
}

const keyFor = (email: string) => `signin-failures|${email.trim().toLowerCase()}`;

/** True when the account reached the limit and its last failure is within the window. */
export async function isSignInLocked(db: Db, email: string, now = Date.now()): Promise<boolean> {
  const row = await db.rateLimit.findUnique({
    where: { key: keyFor(email) },
    select: { count: true, lastRequest: true },
  });
  return Boolean(row && row.count >= failedSignInLimit() && now - Number(row.lastRequest) < FAILED_SIGN_IN_WINDOW_MS);
}

export async function recordFailedSignIn(db: Db, email: string, now = Date.now()): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
  if (!user) return;
  const key = keyFor(email);
  const row = await db.rateLimit.findUnique({ where: { key }, select: { lastRequest: true } });
  const withinWindow = row !== null && now - Number(row.lastRequest) < FAILED_SIGN_IN_WINDOW_MS;
  await db.rateLimit.upsert({
    where: { key },
    create: { key, count: 1, lastRequest: BigInt(now) },
    update: { count: withinWindow ? { increment: 1 } : 1, lastRequest: BigInt(now) },
  });
}

export async function clearFailedSignIns(db: Db, email: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key: keyFor(email) } });
}
