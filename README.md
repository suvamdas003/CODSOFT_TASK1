# EduManage

A full-stack student management system for schools: students, teachers, classes and
sections, subjects, attendance, examinations and report cards, fees, invoices, manual
payments with receipts, dashboards and reports. It has separate, server-enforced
permissions for **administrators**, **teachers** and **students**.

Built with Next.js 16 (App Router) · React 19 · TypeScript (strict) · PostgreSQL ·
Prisma ORM 7 · Better Auth · Tailwind CSS 4 · Radix UI · Zod · React Hook Form · Recharts ·
Vitest · Playwright.

---

## 1. Features

| Area               | What you can do                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authentication** | Email/password sign-in, sign-out, 8-hour sessions in HttpOnly cookies, rate-limited sign-in (per IP and per account), password change, admin password reset, account activation/deactivation. No public sign-up.                                                                                                          |
| **Roles**          | ADMIN (everything), TEACHER (assigned sections and subjects only), STUDENT (own records only). Enforced in the service layer, not just the menu.                                                                                                                                                                          |
| **Students**       | Create, view, edit, search, filter, paginate, deactivate/reactivate. Unique admission numbers, guardian details, section assignment with capacity checks, and a profile showing attendance, results and fees.                                                                                                             |
| **Teachers**       | Profiles with unique employee IDs, sign-in accounts, status, and assignments.                                                                                                                                                                                                                                             |
| **Academics**      | Academic sessions (one current, no overlaps), classes, sections per session with class teacher and capacity, subjects, teaching assignments (one teacher per section and subject).                                                                                                                                        |
| **Attendance**     | Daily roster per section (Present / Late / Absent / Excused, remarks). Re-saving updates rather than duplicates. No future dates. Teachers see only their sections. Section and date-range report with per-student and per-day percentages, low-attendance flags, CSV export.                                             |
| **Examinations**   | Exams per class and session, subjects with max and pass marks, marks entry (validated against the maximum, absent flag, remarks), totals, percentages, configurable grade scales, ranks, publish/unpublish (marks locked when published), printable report cards, retained history.                                       |
| **Fees**           | Fee structures per session and class, single invoices with line items, bulk generation per section or class (never double-bills a period), manual payments (cash, bank transfer, cheque, card terminal) with row locking and idempotency, partial payments, balances, overdue tracking, cancellation, printable receipts. |
| **Dashboards**     | Admin: counts, today's attendance, 14-day attendance chart, exam performance, outstanding and overdue fees, recent activity. Teacher: classes, attendance tasks, marks-entry tasks. Student: attendance, latest results, fee summary.                                                                                     |
| **Reports**        | Exam performance per session, fee collection, overdue invoices (CSV), attendance reports.                                                                                                                                                                                                                                 |
| **Administration** | User accounts, institution settings (currency, locale, attendance policy, document prefixes), grade scales, an append-only audit log.                                                                                                                                                                                     |

All monetary values are stored as integer minor units. Payments are always recorded as
**manual** payments: EduManage does not process card or online payments, and receipts
say so.

## 2. Prerequisites

| Tool           | Version                                 | Notes                                                             |
| -------------- | --------------------------------------- | ----------------------------------------------------------------- |
| Node.js        | 20.19+, 22.12+ or 24+ (LTS recommended) | `node --version`                                                  |
| npm            | 10+                                     | ships with Node                                                   |
| PostgreSQL     | 14 or newer (tested with 17 and 18)     | your own installation (Option A) **or** Docker (Option B)         |
| Docker Desktop | recent (Compose v2)                     | optional: development database, production and demo stacks        |
| Git            | any recent version                      | for version control                                               |
| VS Code        | optional                                | recommended extensions: ESLint, Prisma, Tailwind CSS IntelliSense |

Commands below are given for **Windows PowerShell** and, where they differ, for
**macOS/Linux (bash/zsh)**. Run every command from the `EduManage` folder.

## 3. Open the project in VS Code

1. Open VS Code → **File → Open Folder…** → select the `EduManage` folder.
2. Open a terminal inside VS Code: **Terminal → New Terminal** (it starts in the project folder).

## 4. Install dependencies

```powershell
npm ci
```

`npm ci` installs exactly the versions in `package-lock.json` (use `npm install` only when
you intend to change dependencies). It also generates the Prisma client
(`postinstall` → `prisma generate`).

> **npm 11 note:** newer npm versions print `allow-scripts` warnings about dependency
> install scripts (Prisma, esbuild). They are informational; EduManage works without
> approving them.

## 5. Create the PostgreSQL databases

You need two databases owned by the user `edumanage`: `edumanage` for the app and
`edumanage_test`, a disposable database for the integration tests (the test suite
**erases it** on every run; its name must contain `test`). Choose **one** option.

### Option B (recommended): Docker development database

```powershell
docker compose up -d
```

This starts PostgreSQL 17 with both databases on **`127.0.0.1:5433`** (user `edumanage`,
password `edumanage_dev`, reachable from this computer only). Port 5433 is used so it never
collides with a locally installed PostgreSQL on 5432. The connection strings in
`.env.example` already match it, so no editing is needed. Data persists in the Docker
volume `edumanage_edumanage-pgdata`.

| Task                         | Command                  |
| ---------------------------- | ------------------------ |
| Status                       | `docker compose ps`      |
| Stop (keeps data)            | `docker compose down`    |
| Stop and **delete** dev data | `docker compose down -v` |

To use another host port, set `POSTGRES_PORT=5434` in `.env` and change the port in both
database URLs.

### Option A: your own PostgreSQL (port 5432)

Run as the `postgres` superuser (you are prompted for its password). Pick your own
database password; use letters and digits so it needs no URL-encoding.

Windows PowerShell (adjust `18` to your PostgreSQL version):

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
& $psql -U postgres -h localhost -c "CREATE USER edumanage WITH PASSWORD 'YOUR_DB_PASSWORD' CREATEDB;"
& $psql -U postgres -h localhost -c "CREATE DATABASE edumanage OWNER edumanage;"
& $psql -U postgres -h localhost -c "CREATE DATABASE edumanage_test OWNER edumanage;"
```

macOS/Linux:

```bash
psql -U postgres -h localhost -c "CREATE USER edumanage WITH PASSWORD 'YOUR_DB_PASSWORD' CREATEDB;"
psql -U postgres -h localhost -c "CREATE DATABASE edumanage OWNER edumanage;"
psql -U postgres -h localhost -c "CREATE DATABASE edumanage_test OWNER edumanage;"
```

`CREATEDB` is needed because `prisma migrate dev` creates a temporary shadow database.
In `.env` (next step) use the **Option A** lines from `.env.example`: port `5432` and
`YOUR_DB_PASSWORD`.

## 6. Configure environment variables

Create `.env` from the template:

```powershell
Copy-Item .env.example .env
```

(macOS/Linux: `cp .env.example .env`)

Then edit `.env`:

1. **`BETTER_AUTH_SECRET` (required):** generate a new value and paste it in. The app
   refuses to start with the template placeholder or with anything shorter than 32
   characters.

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

2. **`SEED_DEMO_PASSWORD`:** choose a development-only password for the demo accounts
   (at least 8 characters with a letter and a number; the template value is rejected).
3. **Option A only:** switch both database URLs to the Option A lines.

| Variable                        | Required    | Description                                                                                                                                 |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | yes         | App database. Docker default: `postgresql://edumanage:edumanage_dev@localhost:5433/edumanage?schema=public`. URL-encode special characters. |
| `TEST_DATABASE_URL`             | for tests   | Separate test database (name must contain `test`), e.g. `.../edumanage_test?schema=public`.                                                 |
| `BETTER_AUTH_SECRET`            | yes         | Newly generated random secret, ≥ 32 characters (command above). Never reuse one from a template, archive or another project.                |
| `BETTER_AUTH_URL`               | yes         | URL you open the app at, e.g. `http://localhost:3000`. Must match exactly, or sign-in is rejected by the origin check.                      |
| `SEED_DEMO_PASSWORD`            | for seeding | Password given to every demo account. Development only.                                                                                     |
| `AUTH_SIGNIN_RATE_LIMIT_MAX`    | no          | Sign-in attempts per client IP per minute (default 5).                                                                                      |
| `AUTH_SIGNIN_ACCOUNT_LIMIT_MAX` | no          | Failed sign-ins per account before a 15-minute lock (default 10).                                                                           |
| `BETTER_AUTH_TRUSTED_ORIGINS`   | no          | Extra comma-separated origins allowed to call the auth API.                                                                                 |
| `BETTER_AUTH_TRUSTED_PROXIES`   | no          | Comma-separated IPs/CIDRs of reverse proxies in front of the app (see docs/SECURITY.md).                                                    |
| `POSTGRES_PORT`                 | no          | Host port of the Docker development database (default 5433).                                                                                |

`.env` is excluded from Git and from Docker images. Never commit real secrets. If a secret
was ever shared (chat, email, archive, repository), generate a new one: every session is
invalidated and users simply sign in again.

## 7. Run migrations and load demo data (development only)

```powershell
npm run db:deploy
```

```powershell
npm run db:seed
```

`db:deploy` applies the migrations in `prisma/migrations`. `db:seed` fills an **empty**
database with synthetic data: 1 administrator, 4 teachers, 32 students across 4 sections,
about 5 weeks of attendance, published and draft exams with marks (including last year's
results), fee structures, invoices, and partial and full payments.

The seed is safe by design: it does nothing when the database already has users, and it
refuses to run when `NODE_ENV=production` or when `SEED_DEMO_PASSWORD` is missing, weak or
a template value. Never point `DATABASE_URL` at a real school database while seeding.

To wipe a **development** database and start over:

```powershell
npm run db:reset
```

**This deletes all data** in the `DATABASE_URL` database, re-applies migrations and seeds
again.

## 8. Start the development server

```powershell
npm run dev
```

Open <http://localhost:3000> and sign in with a demo account (section 11).

## 9. Quality checks, tests and production build

| Command                                   | What it does                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                       | Generates Next.js route types and runs `tsc --noEmit` (strict).                                                                                                                                        |
| `npm run lint`                            | ESLint (Next.js core-web-vitals + TypeScript rules).                                                                                                                                                   |
| `npm run format` / `npm run format:check` | Prettier.                                                                                                                                                                                              |
| `npm run test:unit`                       | Unit tests (grading, attendance %, money parsing, validation, CSV safety, secret checks). No database needed.                                                                                          |
| `npm run test:integration`                | Service-layer tests against `TEST_DATABASE_URL`: CRUD, duplicates, authorization and IDOR, attendance, marks, invoices and payments (including concurrency), Better Auth sign-in, CSRF, rate limiting. |
| `npm test`                                | Unit and integration tests.                                                                                                                                                                            |
| `npm run build`                           | Production build.                                                                                                                                                                                      |
| `npm run start`                           | Serve the production build on port 3000.                                                                                                                                                               |
| `npm run test:e2e`                        | Playwright browser tests for admin, teacher and student workflows (see below).                                                                                                                         |
| `npm run check`                           | typecheck + lint + tests + build.                                                                                                                                                                      |

Full verification from a clean checkout (database from section 5 running, `.env`
configured):

```powershell
npm ci
npm run db:deploy
npm run typecheck
npm run lint
npm test
npm run build
```

### End-to-end tests (Playwright)

The e2e tests sign in with the seeded demo accounts, so seed the database first
(section 7). Then either download Playwright's Chromium:

```powershell
npx playwright install chromium
```

or use an installed browser instead (`msedge` or `chrome`):

```powershell
$env:PW_CHANNEL = "msedge"
```

(macOS/Linux: `export PW_CHANNEL=chrome`)

```powershell
npm run build
npm run test:e2e
```

Playwright starts `npm run start` automatically, or reuses a server already running on
port 3000. The e2e tests add a few records (a student, an invoice and payment, attendance
for today, marks), so run them against development data.

## 10. Troubleshooting

| Problem                                                        | Fix                                                                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P1000: Authentication failed`                                 | The user/password in `DATABASE_URL` does not match the database. Docker option: `edumanage` / `edumanage_dev` on port **5433**. Option A: the password you chose, port 5432. |
| `P1001: Can't reach database server`                           | Start PostgreSQL (Windows: Services → `postgresql-x64-NN`; Docker: `docker compose up -d`) and check host **and port** (5433 for Docker, 5432 for a local install).          |
| `docker compose up` fails: port is already allocated           | Another program uses 5433. Set `POSTGRES_PORT=5434` in `.env`, update both database URLs, run `docker compose up -d` again.                                                  |
| `P3014` / shadow database error on `db:migrate`                | Grant `CREATEDB` (`ALTER USER edumanage CREATEDB;`), or use `npm run db:deploy`, which needs no shadow database.                                                             |
| `Cannot find module '@/generated/prisma/...'`                  | Run `npm run db:generate`.                                                                                                                                                   |
| `BETTER_AUTH_SECRET ... placeholder` / `... at least 32` error | Generate a secret (section 6) and put it in `.env` (or `.env.docker`).                                                                                                       |
| Sign-in fails with "Invalid origin" / 403                      | `BETTER_AUTH_URL` must exactly match the URL in the browser (scheme, host and port). Add other origins to `BETTER_AUTH_TRUSTED_ORIGINS`.                                     |
| "Too many sign-in attempts"                                    | Per-IP limit (5 per minute): wait a minute. Per-account limit (10 failures): wait 15 minutes, or an administrator resets the password (Users page), which lifts the lock.    |
| Seed says the database already contains users                  | Seeding only runs on an empty database. Use `npm run db:reset` on a development database (destroys data).                                                                    |
| Seed refuses: `NODE_ENV=production` or template password       | Intended. Never seed a production database; set your own `SEED_DEMO_PASSWORD` for development.                                                                               |
| Integration tests refuse to run                                | `TEST_DATABASE_URL` must be set, differ from `DATABASE_URL`, and the database name must contain `test`.                                                                      |
| Attendance cannot be saved                                     | Dates in the future, outside the section's academic session, or for inactive students are rejected. Check the current session dates in Academics → Sessions.                 |
| "Enable sign-in" fails for a student or teacher                | Sign-in follows the profile status. Reactivate the student/teacher record instead.                                                                                           |
| Port 3000 already in use                                       | Stop the other process, or run `npx next dev -p 3001` and set `BETTER_AUTH_URL=http://localhost:3001`.                                                                       |
| `npm run start` warns about `output: standalone`               | Expected: the build is configured for the Docker image. `npm run start` still serves the app locally (the e2e tests use it).                                                 |
| Playwright: browser not found                                  | `npx playwright install chromium`, or set `PW_CHANNEL=msedge` / `chrome`.                                                                                                    |

## 11. Demo accounts (development only)

Created by `npm run db:seed` (or the Docker demo stack). **Every demo account's password is
the value of `SEED_DEMO_PASSWORD`.** These are fictional people with reserved `.test`
addresses. Never create them on a production system.

| Role          | Email                          | What to try                                                                                                                       |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Administrator | `admin@demo.edumanage.test`    | Dashboard, add a student, generate invoices, record a payment, publish results, settings.                                         |
| Teacher       | `teacher1@demo.edumanage.test` | Maya Patel: Mathematics in every section, class teacher of Grade 6 – A. Take today's attendance; enter Grade 8 Mathematics marks. |
| Student       | `student1@demo.edumanage.test` | Grade 6 – A: dashboard, attendance, published report card, invoices and receipts.                                                 |

Other seeded accounts: `teacher2`–`teacher4@demo.edumanage.test` and
`student2`–`student32@demo.edumanage.test`.

## 12. Deploy with Docker

`docker-compose.prod.yml` runs the whole stack: PostgreSQL 17, a one-off migration
container, and the app (a slim, non-root image built from the Next.js standalone output,
with a health check on `/api/health`). The database is not published to the host. Data
lives in the `edumanage_db-data` volume and survives restarts and rebuilds. The production
stack **never** contains demo data: its migrator runs with `NODE_ENV=production`, so the
seed refuses to run.

1. Create the deployment config:

   ```powershell
   Copy-Item .env.docker.example .env.docker
   ```

   (macOS/Linux: `cp .env.docker.example .env.docker`)

   Edit `.env.docker`: generate `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` with the
   commands written in the file, and set `BETTER_AUTH_URL` to the exact URL users open.

2. Build and start:

   ```powershell
   docker compose -f docker-compose.prod.yml --env-file .env.docker up -d --build
   ```

   Compose waits for the database, applies migrations, then starts the app on
   <http://localhost:3000> (`APP_PORT`).

3. Create the first administrator. There is no public sign-up and no default account.
   Run once with your own values (the password needs at least 8 characters with a letter
   and a number):

   ```powershell
   docker compose -f docker-compose.prod.yml --env-file .env.docker run --rm migrate npx tsx scripts/create-admin.ts --email you@school.example --name "Your Name"
   ```

   The script asks for the password twice without echoing it (it never appears in shell
   history) and refuses to run when an administrator already exists; create every further
   account on the **Users** page. Without Docker, run the same script against the database
   in `.env`: `npx tsx scripts/create-admin.ts --email you@school.example --name "Your Name"`.

Useful commands (add `-f docker-compose.prod.yml --env-file .env.docker` after
`docker compose`):

| Task                         | Command                                                 |
| ---------------------------- | ------------------------------------------------------- |
| Status and health            | `docker compose … ps`                                   |
| App logs                     | `docker compose … logs -f app`                          |
| Update after code changes    | `docker compose … up -d --build` (migrations run again) |
| Stop (keeps data)            | `docker compose … down`                                 |
| Stop and **delete all data** | `docker compose … down -v`                              |

**Back up the database** (custom-format dump, safe in PowerShell because nothing is piped
through the console):

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
docker compose -f docker-compose.prod.yml --env-file .env.docker exec db pg_dump -U edumanage -d edumanage -Fc -f /tmp/edumanage.dump
docker compose -f docker-compose.prod.yml --env-file .env.docker cp db:/tmp/edumanage.dump backups/edumanage.dump
```

Restore into the same stack with
`docker compose … cp backups/edumanage.dump db:/tmp/edumanage.dump` followed by
`docker compose … exec db pg_restore -U edumanage -d edumanage --clean --if-exists /tmp/edumanage.dump`.
The `backups/` folder is excluded from Git and Docker builds; dumps contain personal data,
so store copies securely.

Notes:

- Production session cookies are `Secure`. Browsers accept them on `http://localhost`;
  for any other address, serve the app over HTTPS (for example behind Caddy, nginx or
  Traefik), set `BETTER_AUTH_URL=https://your-domain`, and list the proxy address in
  `BETTER_AUTH_TRUSTED_PROXIES`.
- If you change `APP_PORT`, change the port in `BETTER_AUTH_URL` to match, or sign-in is
  rejected by the origin check.
- `POSTGRES_PASSWORD` is applied only when the `db-data` volume is first created. To change
  it later, run `ALTER USER edumanage WITH PASSWORD '...'` inside the database first, then
  update `.env.docker`.
- If `/api/health` reports `config: "invalid"`, `BETTER_AUTH_SECRET` is missing, too short
  or a placeholder.
- See [docs/SECURITY.md](docs/SECURITY.md) before exposing the app to other users.

### Demo stack (synthetic data, separate from production)

To try EduManage entirely in Docker with the demo accounts, set `SEED_DEMO_PASSWORD` in
`.env.docker` and run:

```powershell
docker compose -f docker-compose.prod.yml -f docker-compose.demo.yml --env-file .env.docker up -d --build
```

This runs as a separate Compose project (`edumanage-demo`) with its own database volume,
so it can never touch the production database. Stop the production stack first if it uses
the same `APP_PORT`. Remove the demo and its data with the same command, replacing
`up -d --build` with `down -v`.

---

## Project structure

```
EduManage/
├─ prisma/                    schema.prisma, migrations/, seed.ts (development demo data)
├─ scripts/                   create-admin.ts (first administrator for real deployments)
├─ src/
│  ├─ app/                    routes: (auth)/login, (dashboard)/…, api/
│  ├─ components/             ui/ (primitives), shared/ (forms, tables, charts), layout/ (navigation)
│  ├─ features/               per-feature server actions and UI
│  ├─ lib/                    validation/ (Zod), utils/ (money, dates, grades, attendance, CSV), auth client
│  ├─ server/                 db.ts, auth/ (Better Auth, session, policy, throttling), services/, repositories/
│  └─ proxy.ts                optimistic auth redirect
├─ tests/                     unit/, integration/, e2e/
├─ docs/                      ARCHITECTURE.md, DATABASE.md, SECURITY.md, AUDIT.md
├─ docker/                    init-test-db.sql (creates edumanage_test in the dev container)
├─ .env.example               local configuration template (placeholders only)
├─ .env.docker.example        Docker configuration template (placeholders only)
├─ docker-compose.yml         development PostgreSQL (127.0.0.1:5433)
├─ docker-compose.prod.yml    production stack: db + migrate + app
├─ docker-compose.demo.yml    optional demo overlay (separate project with demo data)
└─ Dockerfile                 multi-stage build: migrator and runner images
```

Generated folders (`node_modules/`, `.next/`, `src/generated/`, `test-results/`,
`playwright-report/`) are created by the commands above and are never committed.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATABASE.md](docs/DATABASE.md),
[docs/SECURITY.md](docs/SECURITY.md) and [docs/AUDIT.md](docs/AUDIT.md) for details.

## Publishing to your own GitHub repository

`.gitignore` excludes `node_modules`, every `.env*` file except the two templates, build
output, test reports, database dumps and the generated Prisma client.

1. Create an **empty** repository on GitHub (no README, .gitignore or license).
2. In PowerShell, from the `EduManage` folder (replace `<your-account>`):

   ```powershell
   git init -b main
   git add .
   git status --short
   ```

3. Check that nothing secret or generated is staged. Both commands must print **nothing**:

   ```powershell
   git diff --cached --name-only | Select-String -Pattern '(^|/)\.env($|\.)' | Select-String -NotMatch -Pattern '\.example$'
   git diff --cached --name-only | Select-String -Pattern '^(node_modules|\.next|src/generated|backups)/|\.dump$|tsbuildinfo'
   ```

   (macOS/Linux: `git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.example$'`
   and `git diff --cached --name-only | grep -E '^(node_modules|\.next|src/generated|backups)/|\.dump$|tsbuildinfo'`.)

4. Commit and push:

   ```powershell
   git commit -m "Initial commit: EduManage"
   git remote add origin https://github.com/<your-account>/edumanage.git
   git push -u origin main
   ```
