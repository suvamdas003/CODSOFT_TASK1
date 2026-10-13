import type { Db } from "@/server/db";

/**
 * Atomically increment and return a named counter. Prisma issues a native
 * INSERT ... ON CONFLICT DO UPDATE, so concurrent callers always get distinct values.
 * Call inside the same transaction that uses the number so gaps only occur on rollback.
 */
export async function nextSequenceValue(db: Db, key: string): Promise<number> {
  const counter = await db.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  return counter.value;
}

/** e.g. formatDocumentNumber("INV", 2026, 42) -> "INV-2026-000042" */
export function formatDocumentNumber(prefix: string, year: number, value: number): string {
  return `${prefix}-${year}-${String(value).padStart(6, "0")}`;
}

export async function nextDocumentNumber(db: Db, kind: "invoice" | "receipt", prefix: string) {
  const year = new Date().getUTCFullYear();
  const value = await nextSequenceValue(db, `${kind}:${year}`);
  return formatDocumentNumber(prefix, year, value);
}
