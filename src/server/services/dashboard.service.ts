import { Role, StudentStatus, TeacherStatus } from "@/generated/prisma/enums";
import { attendancePercentage, countsFromGroups } from "@/lib/utils/attendance";
import { todayDateOnly } from "@/lib/utils/dates";
import { sectionLabel } from "@/lib/utils/format";
import type { Actor } from "@/server/auth/actor";
import { assertRole } from "@/server/auth/policy";
import { prisma } from "@/server/db";
import { recentActivity } from "./audit.service";
import {
  getAttendancePolicy,
  getAttendanceTrend,
  getStudentAttendanceSummary,
  sectionsPendingAttendance,
} from "./attendance.service";
import { getCurrentSession } from "./academics.service";
import { getExamPerformance, getStudentResults, pendingMarksTasks } from "./exam.service";
import { getFeeOverview, getStudentFees } from "./fee.service";
import { getStudent } from "./student.service";

export async function getAdminDashboard(actor: Actor) {
  assertRole(actor, Role.ADMIN);
  const session = await getCurrentSession();
  const today = todayDateOnly();
  const [students, teachers, sections, todayGroups, policy, trend, exams, fees, activity, pending] = await Promise.all([
    prisma.studentProfile.count({ where: { status: StudentStatus.ACTIVE } }),
    prisma.teacherProfile.count({ where: { status: TeacherStatus.ACTIVE } }),
    session ? prisma.section.count({ where: { academicSessionId: session.id } }) : Promise.resolve(0),
    prisma.attendanceRecord.groupBy({ by: ["status"], where: { date: today }, _count: { _all: true } }),
    getAttendancePolicy(),
    getAttendanceTrend(actor, 14),
    getExamPerformance(actor),
    getFeeOverview(actor),
    recentActivity(actor, 8),
    sectionsPendingAttendance(actor),
  ]);
  const todayCounts = countsFromGroups(todayGroups.map((g) => ({ status: g.status, count: g._count._all })));
  return {
    session,
    counts: { students, teachers, sections },
    attendanceToday: { counts: todayCounts, percentage: attendancePercentage(todayCounts, policy) },
    trend,
    exams,
    fees,
    activity,
    pendingAttendance: pending,
  };
}

export async function getTeacherDashboard(actor: Actor) {
  assertRole(actor, Role.TEACHER);
  const session = await getCurrentSession();
  const [assignments, classSections, pendingAttendance, marksTasks, trend] = await Promise.all([
    actor.teacherId && session
      ? prisma.teachingAssignment.findMany({
          where: { teacherId: actor.teacherId, section: { academicSessionId: session.id } },
          include: {
            subject: { select: { name: true, code: true } },
            section: {
              include: { class: true, _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } } },
            },
          },
          orderBy: [{ section: { class: { level: "asc" } } }, { section: { name: "asc" } }],
        })
      : Promise.resolve([]),
    actor.teacherId && session
      ? prisma.section.findMany({
          where: { classTeacherId: actor.teacherId, academicSessionId: session.id },
          include: { class: true },
        })
      : Promise.resolve([]),
    sectionsPendingAttendance(actor),
    pendingMarksTasks(actor),
    getAttendanceTrend(actor, 7),
  ]);
  return {
    session,
    assignments: assignments.map((a) => ({
      id: a.id,
      subject: a.subject.name,
      sectionId: a.sectionId,
      section: sectionLabel(a.section),
      students: a.section._count.students,
    })),
    classSections: classSections.map((s) => ({ id: s.id, label: sectionLabel(s) })),
    pendingAttendance,
    marksTasks,
    trend,
  };
}

export async function getStudentDashboard(actor: Actor) {
  assertRole(actor, Role.STUDENT);
  if (!actor.studentId) return null;
  const [student, attendance, results, fees] = await Promise.all([
    getStudent(actor, actor.studentId),
    getStudentAttendanceSummary(actor, actor.studentId),
    getStudentResults(actor, actor.studentId),
    getStudentFees(actor, actor.studentId),
  ]);
  return { student, attendance, results: results.slice(0, 5), fees };
}
