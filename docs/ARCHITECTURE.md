# Architecture

EduManage is a single Next.js 16 (App Router) application. There is no separate backend
server: pages, server actions and route handlers all run in the same Node.js process and
share one service layer and one Prisma client.

```
Browser ──► proxy.ts (optimistic cookie check, redirects signed-out users)
        ──► app/ pages (Server Components)      ─┐
        ──► server actions (features/*/actions)  ├─► server/services ─► server/auth/policy ─► Prisma ─► PostgreSQL
        ──► route handlers (app/api/*)          ─┘          │
        ──► /api/auth/* (Better Auth)                        └─► audit log (same transaction)
```

## Layers

| Layer           | Location                                                              | Responsibility                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes & pages  | `src/app`                                                             | URL structure. `(auth)` holds the login page; `(dashboard)` holds every signed-in page and the shared shell. Pages are Server Components that call services and render. |
| Route handlers  | `src/app/api`                                                         | Better Auth endpoints, `/api/health`, CSV exports. Same authorization as pages.                                                                                         |
| Feature modules | `src/features/<feature>`                                              | Server actions (`actions.ts`) and feature-specific UI (forms, tables). Actions are thin: authenticate, call a service, revalidate.                                      |
| Services        | `src/server/services`                                                 | **All business rules and authorization.** Each function takes an `Actor` (the signed-in user) and validates input with Zod. Multi-step writes use transactions.         |
| Authorization   | `src/server/auth/policy.ts`                                           | Role checks and record-level scoping (teacher ↔ assigned sections/subjects, student ↔ own records).                                                                     |
| Data access     | `src/server/db.ts`, `src/server/repositories`                         | Prisma client (driver adapter `@prisma/adapter-pg`), reusable `select` shapes that never include private columns, atomic document-number counters.                      |
| Shared library  | `src/lib`                                                             | Pure, framework-free code used by both client and server: validation schemas, money/date/grade/attendance calculations, error types. Unit-tested.                       |
| UI kit          | `src/components/ui`, `src/components/shared`, `src/components/layout` | Accessible primitives (Radix-based dialogs, native selects), the server-action form wrapper, tables, charts, navigation.                                                |

## Request lifecycle

1. `src/proxy.ts` redirects requests without a session cookie to `/login`. It is an
   optimization only; it never grants access.
2. The `(dashboard)` layout calls `requireActor()`, which validates the session with Better
   Auth and re-reads the user (role, `isActive`, linked profile) from the database.
3. The page calls `requireActor(...roles)` for its own role gate, then calls services with
   the actor. Services enforce record-level rules (e.g. a teacher may only load a section
   they teach). `load()` turns `NOT_FOUND`/`FORBIDDEN` errors into a 404 or the
   access-denied page.
4. Forms submit to server actions through `ActionForm`. `runAction()` authenticates, runs the
   service, revalidates affected paths and returns a serializable `ActionResult`. Expected
   failures (`AppError`) return user-safe messages and field errors; unexpected errors are
   logged server-side and replaced by a generic message.

## Key design decisions

- **Server-side authorization everywhere.** Navigation hides links by role, but every
  service function re-checks permissions, so a crafted request or a direct URL gets the
  same answer as the UI.
- **Configurable policies.** Grade bands, attendance percentage rules, the low-attendance
  threshold, currency, locale and document-number prefixes live in the database
  (`InstitutionSettings`, `GradeScale`), not in code.
- **Money as integers.** Amounts are stored in minor units (`Int`) and parsed from decimal
  strings without floating-point arithmetic (`src/lib/utils/money.ts`).
- **Calendar dates as `DATE`.** Attendance days and due dates are PostgreSQL `DATE` values
  handled in UTC to avoid off-by-one-day bugs across time zones.
- **Manual payments only.** `Payment.source` is `MANUAL`; receipts state that the payment
  was recorded by staff and not processed by a gateway.
- **Cache Components disabled.** Every page is per-user and rendered at request time, so
  the classic dynamic rendering model is simpler and safer (`next.config.ts`).
- **Service layer is framework-independent.** Services do not import `next/*`, so the
  seed script and integration tests call exactly the same code as the UI.

## Folder map

```
src/
  app/                      routes (pages, layouts, route handlers)
    (auth)/login            sign-in page
    (dashboard)/            authenticated shell and all feature pages
    api/                    auth, health, CSV reports
  components/{ui,shared,layout}
  features/<feature>/       server actions + feature UI (students, teachers, academics,
                            attendance, examinations, fees, settings, users, dashboard, auth)
  lib/                      validation/, utils/, auth client, error & result types
  server/                   db.ts, action.ts, page.ts, auth/, services/, repositories/
  proxy.ts                  optimistic auth redirect
prisma/                     schema.prisma, migrations/, seed.ts
tests/                      unit/, integration/, e2e/
```
