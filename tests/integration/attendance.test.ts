import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, toDateOnlyString, todayDateOnly } from "@/lib/utils/dates";
import type { Actor } from "@/server/auth/actor";
import { prisma } from "@/server/db";
import {
  getAttendanceSheet,
  getSectionAttendanceReport,
  getStudentAttendanceSummary,
  saveAttendance,
} from "@/server/services/attendance.service";
import { createSchool, createStudentActor, expectAppError } from "./fixtures";

let school: Awaited<ReturnType<typeof createSchool>>;
let students: Actor[];
let outsider: Actor;
const day = (offset: number) => toDateOnlyString(addDays(todayDateOnly(), offset));

beforeAll(async () => {
  school = await createSchool();
  students = [];
  for (let i = 0; i < 3; i++) students.push(await createStudentActor(school.admin, school.sectionA.id));
  outsider = await createStudentActor(school.admin, school.sectionB.id);
});
afterAll(() => prisma.$disconnect());

const entries = (statuses: string[]) =>
  students.map((s, i) => ({ studentId: s.studentId!, status: statuses[i]!, remarks: "" }));

describe("recording attendance", () => {
  it("records a section's attendance for a day", async () => {
    const result = await saveAttendance(school.teacher, {
      sectionId: school.sectionA.id,
      date: day(-1),
      entries: entries(["PRESENT", "ABSENT", "LATE"]),
    });
    expect(result.saved).toBe(3);
    expect(result.updated).toBe(0);
    expect(
      await prisma.attendanceRecord.count({
        where: { sectionId: school.sectionA.id, date: new Date(`${day(-1)}T00:00:00Z`) },
      }),
    ).toBe(3);
  });

  it("re-submitting the same day updates records instead of duplicating them", async () => {
    const result = await saveAttendance(school.teacher, {
      sectionId: school.sectionA.id,
      date: day(-1),
      entries: entries(["ABSENT", "PRESENT", "PRESENT"]),
    });
    expect(result.updated).toBe(3);
    const records = await prisma.attendanceRecord.findMany({
      where: { sectionId: school.sectionA.id, date: new Date(`${day(-1)}T00:00:00Z`) },
    });
    expect(records).toHaveLength(3);
    expect(records.find((r) => r.studentId === students[0]!.studentId)?.status).toBe("ABSENT");
  });

  it("the database itself rejects a duplicate entry for the same student, section and day", async () => {
    await expect(
      prisma.attendanceRecord.create({
        data: {
          studentId: students[0]!.studentId!,
          sectionId: school.sectionA.id,
          date: new Date(`${day(-1)}T00:00:00Z`),
          status: "PRESENT",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects duplicate students within one submission", async () => {
    const s = students[0]!.studentId!;
    await expectAppError(
      saveAttendance(school.teacher, {
        sectionId: school.sectionA.id,
        date: day(-2),
        entries: [
          { studentId: s, status: "PRESENT" },
          { studentId: s, status: "ABSENT" },
        ],
      }),
      "VALIDATION",
    );
  });

  it("rejects future dates and students from another section", async () => {
    await expectAppError(
      saveAttendance(school.teacher, {
        sectionId: school.sectionA.id,
        date: day(1),
        entries: entries(["PRESENT", "PRESENT", "PRESENT"]),
      }),
      "VALIDATION",
    );
    await expectAppError(
      saveAttendance(school.admin, {
        sectionId: school.sectionA.id,
        date: day(-2),
        entries: [{ studentId: outsider.studentId!, status: "PRESENT" }],
      }),
      "VALIDATION",
    );
  });

  it("teachers can only manage sections they are assigned to", async () => {
    await expectAppError(
      saveAttendance(school.teacher, {
        sectionId: school.sectionB.id,
        date: day(-1),
        entries: [{ studentId: outsider.studentId!, status: "PRESENT" }],
      }),
      "FORBIDDEN",
    );
    await expectAppError(
      getAttendanceSheet(school.teacher, school.sectionB.id, addDays(todayDateOnly(), -1)),
      "FORBIDDEN",
    );
    await expectAppError(
      saveAttendance(students[0]!, {
        sectionId: school.sectionA.id,
        date: day(-1),
        entries: entries(["PRESENT", "PRESENT", "PRESENT"]),
      }),
      "FORBIDDEN",
    );
  });

  it("returns the roster with existing records", async () => {
    const sheet = await getAttendanceSheet(school.teacher, school.sectionA.id, addDays(todayDateOnly(), -1));
    expect(sheet.alreadyRecorded).toBe(true);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows.every((r) => r.record !== null)).toBe(true);
  });
});

describe("attendance percentages and reports", () => {
  beforeAll(async () => {
    // Student 0 over five days: PRESENT, PRESENT, LATE, ABSENT, EXCUSED.
    const plan = [
      ["PRESENT", "PRESENT", "PRESENT"],
      ["PRESENT", "PRESENT", "PRESENT"],
      ["LATE", "PRESENT", "PRESENT"],
      ["ABSENT", "PRESENT", "PRESENT"],
      ["EXCUSED", "PRESENT", "PRESENT"],
    ];
    for (const [i, statuses] of plan.entries()) {
      await saveAttendance(school.admin, {
        sectionId: school.sectionA.id,
        date: day(-10 - i),
        entries: entries(statuses),
      });
    }
  });

  it("calculates per-student percentage using the configured policy", async () => {
    const report = await getSectionAttendanceReport(school.admin, {
      sectionId: school.sectionA.id,
      from: day(-14),
      to: day(-10),
    });
    const row = report.students.find((r) => r.student.id === students[0]!.studentId)!;
    expect(row.counts).toEqual({ PRESENT: 2, LATE: 1, ABSENT: 1, EXCUSED: 1 });
    expect(row.total).toBe(5);
    // Late counts as attended, excused excluded: 3 / 4 = 75%.
    expect(row.percentage).toBe(75);
    expect(report.days).toHaveLength(5);
    expect(report.students.find((r) => r.student.id === students[1]!.studentId)!.percentage).toBe(100);
  });

  it("follows policy changes (late not counted, excused counted as absent)", async () => {
    await prisma.institutionSettings.update({
      where: { id: 1 },
      data: { lateCountsAsPresent: false, excusedExcludedFromTotal: false },
    });
    const report = await getSectionAttendanceReport(school.admin, {
      sectionId: school.sectionA.id,
      from: day(-14),
      to: day(-10),
    });
    // 2 / 5 = 40%
    expect(report.students.find((r) => r.student.id === students[0]!.studentId)!.percentage).toBe(40);
    await prisma.institutionSettings.update({
      where: { id: 1 },
      data: { lateCountsAsPresent: true, excusedExcludedFromTotal: true },
    });
  });

  it("summarizes a student's own attendance", async () => {
    const summary = await getStudentAttendanceSummary(students[1]!, students[1]!.studentId!);
    expect(summary.total).toBeGreaterThanOrEqual(5);
    expect(summary.percentage).not.toBeNull();
  });

  it("validates report date ranges", async () => {
    await expectAppError(
      getSectionAttendanceReport(school.admin, { sectionId: school.sectionA.id, from: day(0), to: day(-5) }),
      "VALIDATION",
    );
  });
});
