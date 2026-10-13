import type { Prisma } from "@/generated/prisma/client";
import { AttendanceStatus, Role, StudentStatus } from "@/generated/prisma/enums";
import { invalid, notFound, parseInput } from "@/lib/errors";
import {
  attendancePercentage,
  countsFromGroups,
  emptyAttendanceCounts,
  totalRecorded,
  type AttendanceCounts,
  type AttendancePolicy,
} from "@/lib/utils/attendance";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import { fullName, sectionLabel } from "@/lib/utils/format";
import { attendanceReportSchema, saveAttendanceSchema } from "@/lib/validation/attendance";
import type { Actor } from "@/server/auth/actor";
import { assertRole, assertSectionAccess, assertStudentAccess, visibleSectionIds } from "@/server/auth/policy";
import { prisma, type Db } from "@/server/db";
import { recordAudit } from "./audit.service";
import { getCurrentSession } from "./academics.service";
import { getSettings } from "./settings.service";

export async function getAttendancePolicy(
  db: Db = prisma,
): Promise<AttendancePolicy & { lowAttendanceThreshold: number }> {
  const s = await getSettings(db);
  return {
    lateCountsAsPresent: s.lateCountsAsPresent,
    excusedExcludedFromTotal: s.excusedExcludedFromTotal,
    lowAttendanceThreshold: s.lowAttendanceThreshold,
  };
}

const MAX_REPORT_DAYS = 400;

/** Roster for one section and day, with any attendance already recorded. */
export async function getAttendanceSheet(actor: Actor, sectionId: string, date: Date) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  await assertSectionAccess(actor, sectionId);
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { class: true, academicSession: true },
  });
  if (!section) throw notFound("Section");

  const [students, records] = await Promise.all([
    prisma.studentProfile.findMany({
      where: {
        OR: [
          { sectionId, status: StudentStatus.ACTIVE, enrollmentDate: { lte: date } },
          { attendance: { some: { sectionId, date } } },
        ],
      },
      select: { id: true, admissionNumber: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.attendanceRecord.findMany({
      where: { sectionId, date },
      select: { studentId: true, status: true, remarks: true, updatedAt: true, recordedBy: { select: { name: true } } },
    }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const session = section.academicSession;
  return {
    section: { id: section.id, label: sectionLabel(section), sessionName: session.name },
    date,
    isFuture: date > todayDateOnly(),
    withinSession: date >= session.startDate && date <= session.endDate,
    alreadyRecorded: records.length > 0,
    lastRecordedBy: records[0]?.recordedBy?.name ?? null,
    rows: students.map((student) => ({ student, record: byStudent.get(student.id) ?? null })),
  };
}

/**
 * Save attendance for a whole section and day in one transaction. Each student has at
 * most one record per section per day (database unique constraint); re-submitting
 * updates the existing records instead of creating duplicates.
 */
export async function saveAttendance(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  const data = parseInput(saveAttendanceSchema, input);
  await assertSectionAccess(actor, data.sectionId);

  if (data.date > todayDateOnly()) {
    throw invalid("Attendance cannot be recorded for a future date.", { date: ["Choose today or an earlier date."] });
  }
  const section = await prisma.section.findUnique({
    where: { id: data.sectionId },
    include: { class: true, academicSession: true },
  });
  if (!section) throw notFound("Section");
  const { startDate, endDate } = section.academicSession;
  if (data.date < startDate || data.date > endDate) {
    throw invalid("The date is outside this section's academic session.", { date: ["Outside the session dates."] });
  }

  const ids = data.entries.map((e) => e.studentId);
  const students = await prisma.studentProfile.findMany({
    where: { id: { in: ids } },
    select: { id: true, sectionId: true, enrollmentDate: true, status: true },
  });
  const existingRecords = await prisma.attendanceRecord.findMany({
    where: { sectionId: data.sectionId, date: data.date, studentId: { in: ids } },
    select: { studentId: true },
  });
  const alreadyRecorded = new Set(existingRecords.map((r) => r.studentId));
  const byId = new Map(students.map((s) => [s.id, s]));
  for (const entry of data.entries) {
    const student = byId.get(entry.studentId);
    // A student must currently belong to the section (or already have a record there that day).
    if (!student || (student.sectionId !== data.sectionId && !alreadyRecorded.has(entry.studentId))) {
      throw invalid("One or more students do not belong to this section.");
    }
    // Deactivated students get no new records; existing ones can still be corrected.
    if (student.status !== StudentStatus.ACTIVE && !alreadyRecorded.has(entry.studentId)) {
      throw invalid("Attendance cannot be recorded for a student who is not active.");
    }
    if (student.enrollmentDate > data.date) {
      throw invalid("Attendance cannot be recorded before a student's enrollment date.");
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const entry of data.entries) {
      await tx.attendanceRecord.upsert({
        where: {
          studentId_sectionId_date: { studentId: entry.studentId, sectionId: data.sectionId, date: data.date },
        },
        create: {
          studentId: entry.studentId,
          sectionId: data.sectionId,
          date: data.date,
          status: entry.status,
          remarks: entry.remarks,
          recordedById: actor.userId,
        },
        update: { status: entry.status, remarks: entry.remarks, recordedById: actor.userId },
      });
    }
    const counts = emptyAttendanceCounts();
    for (const entry of data.entries) counts[entry.status] += 1;
    await recordAudit(tx, actor, {
      action: alreadyRecorded.size > 0 ? "attendance.updated" : "attendance.recorded",
      entityType: "Attendance",
      entityId: data.sectionId,
      summary: `${alreadyRecorded.size > 0 ? "Updated" : "Recorded"} attendance for ${sectionLabel(section)} on ${toDateOnlyString(data.date)}`,
      metadata: counts,
    });
    return { saved: data.entries.length, updated: alreadyRecorded.size, counts };
  });
}

type StudentRow = { id: string; admissionNumber: string; firstName: string; lastName: string };

/** Per-student and per-day attendance for a section over a date range. */
export async function getSectionAttendanceReport(actor: Actor, input: unknown) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  const { sectionId, from, to } = parseInput(attendanceReportSchema, input);
  await assertSectionAccess(actor, sectionId);
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_REPORT_DAYS) {
    throw invalid(`Choose a range of at most ${MAX_REPORT_DAYS} days.`, { to: ["Range is too long."] });
  }
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { class: true } });
  if (!section) throw notFound("Section");

  const where: Prisma.AttendanceRecordWhereInput = { sectionId, date: { gte: from, lte: to } };
  const [byStudentStatus, byDateStatus, students, policy] = await Promise.all([
    prisma.attendanceRecord.groupBy({ by: ["studentId", "status"], where, _count: { _all: true } }),
    prisma.attendanceRecord.groupBy({
      by: ["date", "status"],
      where,
      _count: { _all: true },
      orderBy: { date: "asc" },
    }),
    prisma.studentProfile.findMany({
      where: { OR: [{ sectionId }, { attendance: { some: where } }] },
      select: { id: true, admissionNumber: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    getAttendancePolicy(),
  ]);

  const countsByStudent = new Map<string, AttendanceCounts>();
  for (const row of byStudentStatus) {
    const counts = countsByStudent.get(row.studentId) ?? emptyAttendanceCounts();
    counts[row.status] += row._count._all;
    countsByStudent.set(row.studentId, counts);
  }
  const overall = emptyAttendanceCounts();
  const studentRows = students.map((student: StudentRow) => {
    const counts = countsByStudent.get(student.id) ?? emptyAttendanceCounts();
    for (const status of Object.values(AttendanceStatus)) overall[status] += counts[status];
    const percentage = attendancePercentage(counts, policy);
    return {
      student,
      name: fullName(student),
      counts,
      total: totalRecorded(counts),
      percentage,
      low: percentage !== null && percentage < policy.lowAttendanceThreshold,
    };
  });

  const dayMap = new Map<string, AttendanceCounts>();
  for (const row of byDateStatus) {
    const key = toDateOnlyString(row.date);
    const counts = dayMap.get(key) ?? emptyAttendanceCounts();
    counts[row.status] += row._count._all;
    dayMap.set(key, counts);
  }
  const days = [...dayMap.entries()].map(([date, counts]) => ({
    date,
    counts,
    percentage: attendancePercentage(counts, policy),
  }));

  return {
    section: { id: section.id, label: sectionLabel(section) },
    from,
    to,
    policy,
    students: studentRows,
    days,
    overall: { counts: overall, percentage: attendancePercentage(overall, policy) },
  };
}

/** Attendance summary for one student (defaults to the current academic session). */
export async function getStudentAttendanceSummary(actor: Actor, studentId: string) {
  await assertStudentAccess(actor, studentId);
  const session = await getCurrentSession();
  const where: Prisma.AttendanceRecordWhereInput = {
    studentId,
    ...(session ? { date: { gte: session.startDate, lte: session.endDate } } : {}),
  };
  const [groups, records, policy] = await Promise.all([
    prisma.attendanceRecord.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.attendanceRecord.findMany({
      where,
      select: {
        id: true,
        date: true,
        status: true,
        remarks: true,
        section: { select: { name: true, class: { select: { name: true } } } },
      },
      orderBy: { date: "desc" },
    }),
    getAttendancePolicy(),
  ]);
  const counts = countsFromGroups(groups.map((g) => ({ status: g.status, count: g._count._all })));

  const monthly = new Map<string, AttendanceCounts>();
  for (const record of records) {
    const key = toDateOnlyString(record.date).slice(0, 7);
    const c = monthly.get(key) ?? emptyAttendanceCounts();
    c[record.status] += 1;
    monthly.set(key, c);
  }
  const percentage = attendancePercentage(counts, policy);
  return {
    sessionName: session?.name ?? null,
    counts,
    total: totalRecorded(counts),
    percentage,
    low: percentage !== null && percentage < policy.lowAttendanceThreshold,
    threshold: policy.lowAttendanceThreshold,
    months: [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, c]) => ({ month, counts: c, percentage: attendancePercentage(c, policy) })),
    recent: records.slice(0, 30).map((r) => ({ ...r, sectionLabel: sectionLabel(r.section) })),
  };
}

/** Daily attendance counts over the last `days` days for sections visible to the actor. */
export async function getAttendanceTrend(actor: Actor, days = 14) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  const visible = await visibleSectionIds(actor);
  const today = todayDateOnly();
  const from = addDays(today, -(days - 1));
  const [groups, policy] = await Promise.all([
    prisma.attendanceRecord.groupBy({
      by: ["date", "status"],
      where: { date: { gte: from, lte: today }, ...(visible ? { sectionId: { in: visible } } : {}) },
      _count: { _all: true },
    }),
    getAttendancePolicy(),
  ]);
  const map = new Map<string, AttendanceCounts>();
  for (const g of groups) {
    const key = toDateOnlyString(g.date);
    const c = map.get(key) ?? emptyAttendanceCounts();
    c[g.status] += g._count._all;
    map.set(key, c);
  }
  const series = [];
  for (let i = 0; i < days; i++) {
    const key = toDateOnlyString(addDays(from, i));
    const counts = map.get(key) ?? emptyAttendanceCounts();
    series.push({ date: key, ...counts, percentage: attendancePercentage(counts, policy) });
  }
  return series;
}

/** Sections (current session) visible to the actor that have no attendance for today. */
export async function sectionsPendingAttendance(actor: Actor) {
  assertRole(actor, Role.ADMIN, Role.TEACHER);
  const visible = await visibleSectionIds(actor);
  const session = await getCurrentSession();
  if (!session) return [];
  const today = todayDateOnly();
  if (today < session.startDate || today > session.endDate) return [];
  const sections = await prisma.section.findMany({
    where: {
      academicSessionId: session.id,
      ...(visible ? { id: { in: visible } } : {}),
      students: { some: { status: StudentStatus.ACTIVE } },
      attendance: { none: { date: today } },
    },
    include: { class: true, _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } } },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  });
  return sections.map((s) => ({ id: s.id, label: sectionLabel(s), students: s._count.students }));
}
