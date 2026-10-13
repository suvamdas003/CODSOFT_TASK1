# Security

This document describes the controls EduManage implements and what you must configure
before running it anywhere other than your own machine.

## Authentication

- **Better Auth** (email + password). Passwords are hashed with scrypt; hashes live in
  `Account.password` and are never selected by application queries.
- **No public sign-up.** `disableSignUp: true`; administrators create every account.
- **Sessions** are stored in PostgreSQL and referenced by an `HttpOnly`, `SameSite=Lax`
  cookie, marked `Secure` (with the `__Secure-` prefix) when `NODE_ENV=production`.
  Sessions expire after 8 hours.
- **Deactivation is immediate.** Disabling a user (or setting a student/teacher to a
  non-active status) blocks new sessions and deletes existing ones. Every request also
  re-checks `isActive`.
- **Rate limiting (per client IP).** Sign-in is limited to 5 attempts per minute per client
  IP (`AUTH_SIGNIN_RATE_LIMIT_MAX`), password changes to 5 per minute, other auth endpoints
  to 100 per minute. Counters are stored in the database (`rate_limits`). The client IP is
  read from `X-Forwarded-For`. A client that reaches the app directly can forge that header,
  so this limit alone does not stop password guessing (see the per-account limit below).
  Behind a reverse proxy, list the proxy addresses in `BETTER_AUTH_TRUSTED_PROXIES`; without
  it a multi-hop header is ignored and all clients share one bucket.
- **Failed sign-ins per account.** After 10 failed sign-ins for one account
  (`AUTH_SIGNIN_ACCOUNT_LIMIT_MAX`) further attempts for it are refused for 15 minutes from
  the last failure, whatever IP they come from, even with the correct password. A
  successful sign-in or an administrator password reset clears the counter. Only existing
  accounts are tracked (`src/server/auth/sign-in-throttle.ts`).
- **Generic errors.** Wrong password, unknown email and disabled account all produce the
  same "Invalid email or password" response.

## Authorization

- Enforced in the **service layer** (`src/server/services/*`) through
  `src/server/auth/policy.ts`, never only in the UI.
- Administrators: full access. Teachers: only sections where they are class teacher or have
  a teaching assignment; marks only for their (section, subject) pairs; no fee, user or
  settings access. Students: only their own profile, attendance, published results,
  invoices and receipts.
- **IDOR protection.** Requests for another student's records by ID return _not found_,
  so the response does not reveal whether the record exists.

## Input handling

- Every server action and route handler validates input with **Zod** before use (types,
  lengths, formats, enums, date validity, money precision).
- Prisma uses parameterized queries; the few raw queries use tagged templates (also
  parameterized). There is no string-built SQL from user input.
- React escapes all rendered text; no `dangerouslySetInnerHTML` is used.
- CSV exports neutralize spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes).

## CSRF

- Server actions: Next.js only accepts POSTs whose `Origin` matches the host.
- Auth endpoints: Better Auth origin and Fetch-Metadata checks, enabled explicitly
  (`disableOriginCheck: false`) in every environment. Set `BETTER_AUTH_URL` to the public
  URL, and add other legitimate origins to `BETTER_AUTH_TRUSTED_ORIGINS`.
- `SameSite=Lax` cookies are not sent on cross-site POSTs.

## Data exposure

- API responses and pages use explicit `select` shapes; password hashes, session tokens
  and private columns are never returned.
- Unexpected errors are logged on the server and replaced with a generic message; stack
  traces are never sent to the client.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`; `X-Powered-By` is disabled. Pages are marked `noindex`.

## Auditing

Important administrative changes (accounts, students, teachers, academic setup, exams,
marks, attendance submissions, fees, invoices, payments, settings) are written to
`AuditLog` in the same transaction as the change. Entries contain who, what and when —
never passwords, hashes or tokens.

## Secrets and data

- Configuration comes from environment variables. Only `.env.example` and
  `.env.docker.example` (placeholders) are committed; every other `.env*` file is excluded
  by `.gitignore` and `.dockerignore`, so it never reaches Git or a Docker image.
- Generate `BETTER_AUTH_SECRET` with at least 32 random bytes and keep it private. The app
  refuses to start when the secret is missing, shorter than 32 characters, or still a
  template placeholder (`src/server/auth/secret.ts`).
- **Rotating the secret:** replace `BETTER_AUTH_SECRET` and restart. Every existing session
  becomes invalid and users sign in again. Rotate immediately if the value was ever shared,
  committed or included in an archive.
- The seed script creates **synthetic** people with `*.demo.edumanage.test` addresses and
  refuses to run when `NODE_ENV=production`, when the database already has users, or when
  `SEED_DEMO_PASSWORD` is a template value. The Docker migrator image defaults to
  `NODE_ENV=production`, and the production Compose stack sets it explicitly, so demo
  accounts can only be created in the separate `edumanage-demo` stack
  (`docker-compose.demo.yml`) or in a development database.
- Database backups (`pg_dump`) contain personal data. Keep them in `backups/` (git- and
  docker-ignored) or outside the project folder.

## Before deploying

1. Use a dedicated database user with a strong password and TLS (`?sslmode=require`).
2. Set a new `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://your-domain`, and
   `NODE_ENV=production`; serve over HTTPS only.
3. Never run `npm run db:seed` against production; create the first administrator
   deliberately and delete any demo accounts.
4. If a reverse proxy terminates HTTPS, have it set `X-Forwarded-For` and list its address
   in `BETTER_AUTH_TRUSTED_PROXIES`, and do not expose the app port directly.
5. Back up the database regularly and restrict who can read the audit log.
6. Review `npm audit` output and keep dependencies updated.
