# Database

PostgreSQL, managed with Prisma ORM 7 (`prisma/schema.prisma`, migrations in
`prisma/migrations`). The Prisma client is generated into `src/generated/prisma`
(git-ignored; `npm install` regenerates it via `postinstall`).

## Entity overview

```
User ─┬─ Session / Account (Better Auth; password hash lives in Account.password)
      ├─ StudentProfile ── Section ── SchoolClass
      │        │              └──── AcademicSession
      │        ├─ AttendanceRecord (student, section, date)  UNIQUE(student, section, date)
      │        ├─ Mark ── ExamSubject ── Exam ── GradeScale ── GradeBand
      │        └─ Invoice ── InvoiceItem ── FeeStructure
      │              └─ Payment
      └─ TeacherProfile ── TeachingAssignment (teacher, section, subject)  UNIQUE(section, subject)

InstitutionSettings (single row)   Counter (document numbers)   AuditLog   RateLimit
```

| Model                                             | Purpose / notable rules                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                                            | Login identity with `role` (ADMIN, TEACHER, STUDENT) and `isActive`. Unique email.                                                                   |
| `Session`, `Account`, `Verification`, `RateLimit` | Better Auth tables. Sessions cascade-delete with the user.                                                                                           |
| `StudentProfile`                                  | Unique `admissionNumber`; guardian details; current `sectionId`; `status` (ACTIVE/INACTIVE/GRADUATED/TRANSFERRED). Only ACTIVE students can sign in. |
| `TeacherProfile`                                  | Unique `employeeId`; `status`.                                                                                                                       |
| `AcademicSession`                                 | Named date range; exactly one `isCurrent` (enforced transactionally). Overlapping sessions are rejected.                                             |
| `SchoolClass`, `Section`                          | Section is unique per (class, session, name); optional capacity and class teacher.                                                                   |
| `Subject`, `TeachingAssignment`                   | One teacher per (section, subject).                                                                                                                  |
| `AttendanceRecord`                                | Status PRESENT / ABSENT / LATE / EXCUSED. Unique per (student, section, date).                                                                       |
| `Exam`, `ExamSubject`, `Mark`                     | Exam per (session, class, name); max/pass marks per subject; one mark per (exam subject, student). Marks are locked while the exam is PUBLISHED.     |
| `GradeScale`, `GradeBand`                         | Configurable bands (label + minimum %). Scales used by published exams cannot be edited, preserving historical grades.                               |
| `FeeStructure`                                    | Amount in minor units, per session and optionally per class.                                                                                         |
| `Invoice`, `InvoiceItem`                          | `totalMinor`, `paidMinor`, status (UNPAID / PARTIALLY_PAID / PAID / CANCELLED). `periodLabel` prevents billing the same fee twice for one period.    |
| `Payment`                                         | Manual payment with unique `receiptNumber` and unique `idempotencyKey`.                                                                              |
| `AuditLog`                                        | Append-only record of administrative changes (never secrets).                                                                                        |

## Integrity rules enforced by the database

Foreign keys use `onDelete: Restrict` for academic and financial history, `Cascade` only
for auth tables and invoice line items, and `SetNull` for optional "who did this" links.
The migration `*_check_constraints` adds CHECK constraints that Prisma's schema language
cannot express:

- amounts are positive; `0 <= paidMinor <= totalMinor`; due date not before issue date;
- `maxMarks > 0`, `0 <= passMarks <= maxMarks`, marks non-negative, absent ⇔ no score;
- session end after start; section capacity positive; grade band minimum within 0–100;
- `InstitutionSettings` has exactly one row.

Unique constraints back up the service-level checks (admission number, employee ID, email,
attendance per day, mark per subject, invoice/receipt numbers, idempotency keys).

## Concurrency

- **Payments** lock the invoice row (`SELECT … FOR UPDATE`) inside the transaction, check
  the outstanding balance, insert the payment and update `paidMinor`/`status`. Concurrent
  payments on the same invoice are serialized; the CHECK constraint is a final guard.
- **Duplicate submissions**: payment forms carry a random idempotency key; a repeated key
  returns the original payment instead of creating another.
- **Invoice generation** takes a transaction-scoped advisory lock per fee structure so two
  bulk runs cannot double-bill the same period.
- **Document numbers** (`INV-2026-000001`, `RCT-…`) come from an atomic upsert-increment on
  `Counter` within the same transaction.
- **Attendance and marks** use upserts on their unique keys, so re-submitting a form
  updates rows instead of duplicating them.

## Commands

| Task                                                                  | Command                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------- |
| Apply migrations in development (creates new ones after schema edits) | `npm run db:migrate`                                 |
| Apply existing migrations (CI / production)                           | `npm run db:deploy`                                  |
| Seed synthetic demo data (empty development database only)            | `npm run db:seed`                                    |
| Create the first administrator of a real deployment (no demo data)    | `npx tsx scripts/create-admin.ts --email … --name …` |
| Drop all data, re-apply migrations, seed again (**destroys data**)    | `npm run db:reset`                                   |
| Regenerate the Prisma client                                          | `npm run db:generate`                                |
| Browse data                                                           | `npm run db:studio`                                  |

### Changing the schema

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate -- --name describe_change` — creates and applies a migration.
3. Commit the new folder under `prisma/migrations/`.

Custom SQL (e.g. more CHECK constraints): `npx prisma migrate dev --create-only --name x`,
edit the generated `migration.sql`, then `npm run db:migrate`.
