import { Role } from "@/generated/prisma/enums";
import { conflict, invalid, notFound, parseInput } from "@/lib/errors";
import { validateGradeBands, type GradeBandLike } from "@/lib/utils/grades";
import { gradeScaleSchema } from "@/lib/validation/exams";
import { settingsSchema } from "@/lib/validation/users";
import type { Actor } from "@/server/auth/actor";
import { assertRole } from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";
import { recordAudit } from "./audit.service";

/**
 * Institution settings (created with defaults on first access). The insert uses
 * ON CONFLICT DO NOTHING so concurrent first requests cannot race on the primary key.
 */
export async function getSettings(db: Db = prisma) {
  const existing = await db.institutionSettings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  await db.institutionSettings.createMany({ data: [{ id: 1 }], skipDuplicates: true });
  return db.institutionSettings.findUniqueOrThrow({ where: { id: 1 } });
}

export type InstitutionSettingsView = Awaited<ReturnType<typeof getSettings>>;

export async function updateSettings(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(settingsSchema, input);
  return prisma.$transaction(async (tx) => {
    const current = await getSettings(tx);
    // Amounts are stored in the currency's minor unit, so a switch (e.g. USD -> JPY) would
    // silently change every stored fee and invoice amount.
    if (data.currencyCode !== current.currencyCode) {
      if ((await tx.invoice.count()) > 0) {
        throw invalid("The currency cannot be changed after invoices have been issued.", {
          currencyCode: ["Currency is locked because invoices exist."],
        });
      }
      if ((await tx.feeStructure.count()) > 0) {
        throw invalid("The currency cannot be changed while fee structures exist.", {
          currencyCode: ["Currency is locked because fee amounts are stored in it. Delete the fees first."],
        });
      }
    }
    const updated = await tx.institutionSettings.update({ where: { id: 1 }, data });
    await recordAudit(tx, actor, {
      action: "settings.updated",
      entityType: "Settings",
      entityId: "1",
      summary: "Updated institution settings",
    });
    return updated;
  });
}

// ───────────── Grade scales ─────────────

const toBandLike = (band: {
  label: string;
  minPercent: { toNumber(): number } | number;
  gradePoint: { toNumber(): number } | number | null;
  remark: string | null;
  isPassing: boolean;
}): GradeBandLike => ({
  label: band.label,
  minPercent: Number(band.minPercent),
  gradePoint: band.gradePoint === null ? null : Number(band.gradePoint),
  remark: band.remark,
  isPassing: band.isPassing,
});

export async function listGradeScales(db: Db = prisma) {
  const scales = await db.gradeScale.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      bands: { orderBy: { minPercent: "desc" } },
      _count: { select: { exams: true } },
    },
  });
  return scales.map((scale) => ({
    id: scale.id,
    name: scale.name,
    description: scale.description,
    isDefault: scale.isDefault,
    examCount: scale._count.exams,
    bands: scale.bands.map(toBandLike),
  }));
}

export async function getGradeBands(scaleId: string, db: Db = prisma): Promise<GradeBandLike[]> {
  const bands = await db.gradeBand.findMany({ where: { scaleId }, orderBy: { minPercent: "desc" } });
  return bands.map(toBandLike);
}

/** Create (scaleId = null) or replace a grade scale and its bands. */
export async function saveGradeScale(actor: Actor, scaleId: string | null, input: unknown) {
  assertRole(actor, Role.ADMIN);
  const data = parseInput(gradeScaleSchema, input);
  const bands = data.bands.map((b) => ({ ...b, label: b.label.toUpperCase() }));
  const errors = validateGradeBands(bands);
  if (errors.length) throw invalid(errors[0]!, { bands: errors });

  return prisma.$transaction(async (tx) => {
    if (scaleId) {
      const existing = await tx.gradeScale.findUnique({ where: { id: scaleId } });
      if (!existing) throw notFound("Grade scale");
      const published = await tx.exam.count({ where: { gradeScaleId: scaleId, status: "PUBLISHED" } });
      if (published > 0) {
        throw conflict(
          "This scale is used by published exams. Create a new scale so historical grades stay unchanged.",
        );
      }
    }
    const duplicate = await tx.gradeScale.findFirst({
      where: { name: { equals: data.name, mode: "insensitive" }, NOT: scaleId ? { id: scaleId } : undefined },
    });
    if (duplicate) throw conflict("A grade scale with this name already exists.", { name: ["Name is taken."] });

    if (data.isDefault) await tx.gradeScale.updateMany({ data: { isDefault: false } });
    const hasDefault = (await tx.gradeScale.count({ where: { isDefault: true } })) > 0;

    const fields = {
      name: data.name,
      description: data.description,
      isDefault: data.isDefault || !hasDefault,
    };
    const scale = scaleId
      ? await tx.gradeScale.update({ where: { id: scaleId }, data: fields })
      : await tx.gradeScale.create({ data: fields });

    await tx.gradeBand.deleteMany({ where: { scaleId: scale.id } });
    await tx.gradeBand.createMany({
      data: bands.map((b) => ({
        scaleId: scale.id,
        label: b.label,
        minPercent: b.minPercent,
        gradePoint: b.gradePoint,
        remark: b.remark,
        isPassing: b.isPassing,
      })),
    });
    await recordAudit(tx, actor, {
      action: scaleId ? "gradeScale.updated" : "gradeScale.created",
      entityType: "GradeScale",
      entityId: scale.id,
      summary: `${scaleId ? "Updated" : "Created"} grade scale ${scale.name}`,
    });
    return scale;
  });
}

export async function deleteGradeScale(actor: Actor, scaleId: string) {
  assertRole(actor, Role.ADMIN);
  return prisma.$transaction(async (tx) => {
    const scale = await tx.gradeScale.findUnique({
      where: { id: scaleId },
      include: { _count: { select: { exams: true } } },
    });
    if (!scale) throw notFound("Grade scale");
    if (scale._count.exams > 0) throw conflict("This grade scale is used by exams and cannot be deleted.");
    if (scale.isDefault) throw conflict("Choose another default scale before deleting this one.");
    await tx.gradeScale.delete({ where: { id: scaleId } });
    await recordAudit(tx, actor, {
      action: "gradeScale.deleted",
      entityType: "GradeScale",
      entityId: scaleId,
      summary: `Deleted grade scale ${scale.name}`,
    });
  });
}
