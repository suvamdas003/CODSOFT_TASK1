import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/server/db";
import { checkSecretStrength } from "./secret";
import { clearFailedSignIns, isSignInLocked, recordFailedSignIn } from "./sign-in-throttle";

const signInMax = Number.parseInt(process.env.AUTH_SIGNIN_RATE_LIMIT_MAX ?? "", 10) || 5;

const csv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const extraOrigins = csv(process.env.BETTER_AUTH_TRUSTED_ORIGINS);
// Reverse proxies (IPs/CIDRs) allowed to append to X-Forwarded-For. Without them only a
// single-value header is trusted, which a client can forge; see sign-in-throttle.ts.
const trustedProxies = csv(process.env.BETTER_AUTH_TRUSTED_PROXIES);

/**
 * Refuse to start with a missing, short or template secret (for example the value copied
 * from .env.example). Skipped while `next build` evaluates modules without runtime config.
 */
function resolveSecret(): string | undefined {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (process.env.NEXT_PHASE === "phase-production-build") return secret;
  const problem = checkSecretStrength(secret);
  if (problem)
    throw new Error(
      `BETTER_AUTH_SECRET ${problem} Generate a new one (see README, "Configure environment variables").`,
    );
  return secret;
}

const SIGN_IN_PATH = "/sign-in/email";
const signInEmail = (body: unknown) =>
  body && typeof body === "object" && typeof (body as { email?: unknown }).email === "string"
    ? (body as { email: string }).email
    : null;

/**
 * Better Auth server instance.
 * - Email + password only; public sign-up is disabled (administrators create accounts).
 * - Sessions are stored in PostgreSQL and referenced by an HttpOnly, SameSite=Lax cookie
 *   (Secure in production). Origin checks protect state-changing auth endpoints from CSRF.
 * - Sign-in attempts are rate limited per client IP using database storage, and failed
 *   attempts are additionally limited per account (independent of the client IP).
 * - Deactivated users cannot start a session.
 */
export const auth = betterAuth({
  appName: "EduManage",
  secret: resolveSecret(),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: extraOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 8, // 8 hours
    updateAge: 60 * 60, // refresh expiry at most hourly
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: signInMax },
      "/change-password": { window: 60, max: 5 },
    },
  },
  advanced: {
    // Explicit: Better Auth would otherwise skip origin/CSRF checks when NODE_ENV=test.
    disableOriginCheck: false,
    disableCSRFCheck: false,
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    ipAddress: trustedProxies.length > 0 ? { trustedProxies } : undefined,
  },
  hooks: {
    // Per-account limit on failed sign-ins. The per-IP limit above relies on
    // X-Forwarded-For, which a client can vary when it reaches the app directly.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = signInEmail(ctx.body);
      if (email && (await isSignInLocked(prisma, email))) {
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in attempts. Try again later." });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const email = signInEmail(ctx.body);
      if (!email) return;
      const returned = ctx.context.returned;
      if (isAPIError(returned)) {
        if (returned.statusCode === 401) await recordFailedSignIn(prisma, email);
      } else {
        await clearFailedSignIns(prisma, email);
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });
          // Same message as a wrong password so account state is not disclosed.
          if (!user?.isActive) {
            throw new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
          }
        },
        after: async (session) => {
          await prisma.user.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
          });
        },
      },
    },
  },
  // nextCookies must be the last plugin so Set-Cookie works inside server actions.
  plugins: [nextCookies()],
});
