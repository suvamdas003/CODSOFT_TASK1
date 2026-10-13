/**
 * Development seed: creates SYNTHETIC demo data only (fictional names, *.test emails).
 *
 *   npm run db:seed      (requires an empty database and SEED_DEMO_PASSWORD)
 *   npm run db:reset     (drops everything, re-applies migrations, then seeds)
 *
 * Data is created through the application's service layer so it passes exactly the
 * same validation, authorization and transaction rules as data entered in the UI.
 * Never run against a production database.
 */
import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { AttendanceStatus, PaymentMethod, Role, type Gender } from "../src/generated/prisma/enums";
import { addDays, parseDateOnly, toDateOnlyString, todayDateOnly } from "../src/lib/utils/dates";
import type { Actor } from "../src/server/auth/actor";
import { prisma } from "../src/server/db";
import * as academics from "../src/server/services/academics.service";
import { saveAttendance } from "../src/server/services/attendance.service";
import * as exams from "../src/server/services/exam.service";
import * as fees from "../src/server/services/fee.service";
import { saveGradeScale } from "../src/server/services/settings.service";
import { createStudent } from "../src/server/services/student.service";
import { createTeacher } from "../src/server/services/teacher.service";
import { createLoginUser } from "../src/server/services/user.service";

const DOMAIN = "demo.edumanage.test"; // .test is reserved and never routable

// Deterministic pseudo-random numbers so every seed run produces the same data.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261013);
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;

const FIRST_NAMES = [
  "Aarav",
  "Bianca",
  "Chen",
  "Dara",
  "Elif",
  "Farah",
  "Gabriel",
  "Hana",
  "Ivan",
  "Jaya",
  "Kofi",
  "Lena",
  "Mateo",
  "Nia",
  "Omar",
  "Priya",
  "Quinn",
  "Rosa",
  "Samir",
  "Tara",
  "Uma",
  "Victor",
  "Wen",
  "Yusuf",
  "Zara",
  "Leo",
  "Mira",
  "Arjun",
  "Ines",
  "Theo",
  "Amara",
  "Ravi",
];
const LAST_NAMES = [
  "Anand",
  "Brooks",
  "Castillo",
  "Dubois",
  "Eriksen",
  "Fernandes",
  "Gupta",
  "Haddad",
  "Ito",
  "Johansson",
  "Kaur",
  "Lopez",
  "Mensah",
  "Novak",
  "Osei",
  "Petrov",
  "Quintero",
  "Rahman",
  "Silva",
  "Tanaka",
];
const GUARDIAN_RELATIONS = ["Mother", "Father", "Guardian", "Grandparent"];

function requireSafeEnvironment() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production.");
  }
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Set SEED_DEMO_PASSWORD in .env (at least 8 characters with a letter and a number).");
  }
  if (/choose-a|replace-with|change-?me/i.test(password)) {
    throw new Error("SEED_DEMO_PASSWORD still has the template value. Choose your own development password.");
  }
  return password;
}

/** School days (Mon–Fri) in [from, to]. */
function weekdays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days;
}

function randomAttendance(): AttendanceStatus {
  const r = random();
  if (r < 0.86) return AttendanceStatus.PRESENT;
  if (r < 0.92) return AttendanceStatus.LATE;
  if (r < 0.98) return AttendanceStatus.ABSENT;
  return AttendanceStatus.EXCUSED;
}

/** Marks with a per-student ability so results look plausible (two decimals max). */
function randomMark(ability: number, max: number): string {
  const value = Math.max(0, Math.min(max, Math.round((ability * max + (random() - 0.5) * 30) * 2) / 2));
  return String(value);
}

async function main() {
  const password = requireSafeEnvironment();
  if ((await prisma.user.count()) > 0) {
    console.log("The database already contains users. Run `npm run db:reset` to wipe it and seed again.");
    return;
  }

  console.log("Seeding synthetic demo data…");
  // One hash for every demo account keeps seeding fast; acceptable for throwaway dev data only.
  const passwordHash = await hashPassword(password);

  // ── Administrator ──
  const adminId = await prisma.$transaction((tx) =>
    createLoginUser(tx, { name: "Alex Morgan", email: `admin@${DOMAIN}`, role: Role.ADMIN, passwordHash }),
  );
  const admin: Actor = {
    userId: adminId,
    name: "Alex Morgan",
    email: `admin@${DOMAIN}`,
    role: Role.ADMIN,
    studentId: null,
    teacherId: null,
  };

  await prisma.institutionSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      name: "Greenfield Demo School",
      address: "1 Example Avenue, Sampletown",
      phone: "+1 555 0100",
      email: `office@${DOMAIN}`,
    },
    update: {},
  });

  // ── Grade scale ──
  await saveGradeScale(admin, null, {
    name: "Standard A–F",
    description: "Default percentage bands",
    isDefault: "on",
    bands: [
      { label: "A+", minPercent: "90", gradePoint: "4", remark: "Outstanding", isPassing: "on" },
      { label: "A", minPercent: "80", gradePoint: "3.7", remark: "Excellent", isPassing: "on" },
      { label: "B", minPercent: "70", gradePoint: "3", remark: "Very good", isPassing: "on" },
      { label: "C", minPercent: "60", gradePoint: "2", remark: "Good", isPassing: "on" },
      { label: "D", minPercent: "40", gradePoint: "1", remark: "Satisfactory", isPassing: "on" },
      { label: "F", minPercent: "0", gradePoint: "0", remark: "Needs improvement", isPassing: "" },
    ],
  });
  const scale = await prisma.gradeScale.findFirstOrThrow({ where: { isDefault: true } });

  // ── Academic sessions relative to today (sessions run 1 April – 31 March) ──
  const today = todayDateOnly();
  const startYear = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  const sessionRange = (y: number) => ({ startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` });
  const previous = await academics.createSession(admin, {
    name: `${startYear - 1}-${startYear}`,
    ...sessionRange(startYear - 1),
  });
  const current = await academics.createSession(admin, {
    name: `${startYear}-${startYear + 1}`,
    ...sessionRange(startYear),
    isCurrent: "on",
  });

  // ── Classes & subjects ──
  const grade6 = await academics.createClass(admin, { name: "Grade 6", level: "6" });
  const grade7 = await academics.createClass(admin, { name: "Grade 7", level: "7" });
  const grade8 = await academics.createClass(admin, { name: "Grade 8", level: "8" });
  const subjectDefs = [
    ["ENG", "English"],
    ["MATH", "Mathematics"],
    ["SCI", "Science"],
    ["SST", "Social Studies"],
    ["CS", "Computer Science"],
  ] as const;
  const subjects: Record<string, string> = {};
  for (const [code, name] of subjectDefs) {
    subjects[code] = (await academics.createSubject(admin, { code, name, isActive: "on" })).id;
  }

  // ── Teachers ──
  const teacherDefs = [
    { employeeId: "EMP-001", firstName: "Maya", lastName: "Patel", specialization: "Mathematics" },
    { employeeId: "EMP-002", firstName: "Daniel", lastName: "Okafor", specialization: "English" },
    { employeeId: "EMP-003", firstName: "Sofia", lastName: "Lindqvist", specialization: "Science" },
    { employeeId: "EMP-004", firstName: "Kenji", lastName: "Watanabe", specialization: "Social Studies" },
  ];
  const teacherIds: string[] = [];
  for (const [i, t] of teacherDefs.entries()) {
    teacherIds.push(
      await createTeacher(admin, {
        ...t,
        email: `teacher${i + 1}@${DOMAIN}`,
        password,
        phone: `+1 555 01${10 + i}`,
        qualification: "B.Ed.",
        joiningDate: `${startYear - 3}-06-01`,
      }),
    );
  }
  const [maya, daniel, sofia, kenji] = teacherIds as [string, string, string, string];

  // ── Sections ──
  const prevSection = await academics.createSection(admin, {
    classId: grade6.id,
    academicSessionId: previous.id,
    name: "A",
    classTeacherId: maya,
    capacity: "35",
  });
  const s6a = await academics.createSection(admin, {
    classId: grade6.id,
    academicSessionId: current.id,
    name: "A",
    classTeacherId: maya,
    capacity: "35",
    room: "101",
  });
  const s6b = await academics.createSection(admin, {
    classId: grade6.id,
    academicSessionId: current.id,
    name: "B",
    classTeacherId: daniel,
    capacity: "35",
    room: "102",
  });
  const s7a = await academics.createSection(admin, {
    classId: grade7.id,
    academicSessionId: current.id,
    name: "A",
    classTeacherId: sofia,
    capacity: "35",
    room: "201",
  });
  const s8a = await academics.createSection(admin, {
    classId: grade8.id,
    academicSessionId: current.id,
    name: "A",
    classTeacherId: kenji,
    capacity: "35",
    room: "301",
  });
  const currentSections = [s6a, s6b, s7a, s8a];

  // Teaching assignments: one teacher per core subject across sections; CS for Grade 8.
  for (const section of [prevSection, ...currentSections]) {
    await academics.createAssignment(admin, { teacherId: maya, sectionId: section.id, subjectId: subjects.MATH });
    await academics.createAssignment(admin, { teacherId: daniel, sectionId: section.id, subjectId: subjects.ENG });
    await academics.createAssignment(admin, { teacherId: sofia, sectionId: section.id, subjectId: subjects.SCI });
    await academics.createAssignment(admin, { teacherId: kenji, sectionId: section.id, subjectId: subjects.SST });
  }
  await academics.createAssignment(admin, { teacherId: kenji, sectionId: s8a.id, subjectId: subjects.CS });

  // ── Students: 8 per current section. Grade 7 students start in last year's Grade 6. ──
  const ability = new Map<string, number>();
  const studentsBySection = new Map<string, string[]>();
  let n = 0;
  for (const section of currentSections) {
    const ids: string[] = [];
    const promoted = section.id === s7a.id;
    for (let i = 0; i < 8; i++) {
      n += 1;
      const firstName = FIRST_NAMES[(n - 1) % FIRST_NAMES.length]!;
      const lastName = pick(LAST_NAMES);
      const id = await createStudent(admin, {
        admissionNumber: `ADM-${promoted ? startYear - 1 : startYear}-${String(n).padStart(4, "0")}`,
        firstName,
        lastName,
        email: `student${n}@${DOMAIN}`,
        password,
        dateOfBirth: `${startYear - (section.classId === grade6.id ? 12 : section.classId === grade7.id ? 13 : 14)}-${String(1 + (n % 12)).padStart(2, "0")}-${String(1 + (n % 27)).padStart(2, "0")}`,
        gender: (["FEMALE", "MALE", "UNDISCLOSED", "OTHER"] as Gender[])[n % 4],
        phone: "",
        address: `${10 + n} Sample Street, Sampletown`,
        guardianName: `${pick(FIRST_NAMES)} ${lastName}`,
        guardianRelation: pick(GUARDIAN_RELATIONS),
        guardianPhone: `+1 555 02${String(n).padStart(2, "0")}`,
        guardianEmail: `guardian${n}@${DOMAIN}`,
        sectionId: promoted ? prevSection.id : section.id,
        enrollmentDate: promoted ? sessionRange(startYear - 1).startDate : sessionRange(startYear).startDate,
        status: "ACTIVE",
      });
      ids.push(id);
      ability.set(id, 0.45 + random() * 0.5);
    }
    studentsBySection.set(section.id, ids);
  }

  async function enterMarks(
    examId: string,
    sectionId: string,
    studentIds: string[],
    options: { skipSubjects?: string[]; fraction?: number } = {},
  ) {
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId }, include: { subjects: true } });
    for (const es of exam.subjects) {
      if (options.skipSubjects?.includes(es.subjectId)) continue;
      const count = Math.round(studentIds.length * (options.fraction ?? 1));
      const entries = studentIds.slice(0, count).map((studentId) => {
        const absent = random() < 0.03;
        return {
          studentId,
          marks: absent ? "" : randomMark(ability.get(studentId)!, es.maxMarks),
          isAbsent: absent ? "on" : "",
          remarks: "",
        };
      });
      await exams.saveMarks(admin, { examSubjectId: es.id, sectionId, entries });
    }
  }

  async function createExamWithSubjects(
    name: string,
    sessionId: string,
    classId: string,
    start: Date,
    codes: string[],
  ) {
    const exam = await exams.createExam(admin, {
      name,
      academicSessionId: sessionId,
      classId,
      gradeScaleId: scale.id,
      startDate: toDateOnlyString(start),
      endDate: toDateOnlyString(addDays(start, 4)),
    });
    for (const [i, code] of codes.entries()) {
      await exams.addExamSubject(admin, exam.id, {
        subjectId: subjects[code]!,
        maxMarks: "100",
        passMarks: "35",
        examDate: toDateOnlyString(addDays(start, i)),
      });
    }
    return exam;
  }

  // ── Historical exam (previous session) for the students now in Grade 7 ──
  const core = ["ENG", "MATH", "SCI", "SST"];
  const grade7Students = studentsBySection.get(s7a.id)!;
  const finalExam = await createExamWithSubjects(
    "Final Examination",
    previous.id,
    grade6.id,
    parseDateOnly(`${startYear}-03-02`),
    core,
  );
  await enterMarks(finalExam.id, prevSection.id, grade7Students);
  await exams.setExamPublished(admin, finalExam.id, true);
  // Promote them into the current session's Grade 7 – A (history stays attached to them).
  await prisma.studentProfile.updateMany({ where: { id: { in: grade7Students } }, data: { sectionId: s7a.id } });

  // ── Attendance: school days of the last ~5 weeks (today left open for the demo) ──
  const sessionStart = parseDateOnly(sessionRange(startYear).startDate);
  const from = addDays(today, -35) > sessionStart ? addDays(today, -35) : sessionStart;
  const days = weekdays(from, addDays(today, -1));
  for (const section of currentSections) {
    const studentIds = studentsBySection.get(section.id)!;
    for (const day of days) {
      await saveAttendance(admin, {
        sectionId: section.id,
        date: toDateOnlyString(day),
        entries: studentIds.map((studentId) => ({ studentId, status: randomAttendance(), remarks: "" })),
      });
    }
  }

  // ── Current-session exams ──
  const termStart = addDays(today, -21) > sessionStart ? addDays(today, -21) : sessionStart;
  const term6 = await createExamWithSubjects("Term 1 Examination", current.id, grade6.id, termStart, core);
  await enterMarks(term6.id, s6a.id, studentsBySection.get(s6a.id)!);
  await enterMarks(term6.id, s6b.id, studentsBySection.get(s6b.id)!);
  await exams.setExamPublished(admin, term6.id, true);

  const term7 = await createExamWithSubjects("Term 1 Examination", current.id, grade7.id, termStart, core);
  await enterMarks(term7.id, s7a.id, grade7Students);
  await exams.setExamPublished(admin, term7.id, true);

  // Draft exam with incomplete marks -> shows up as teacher marks-entry tasks.
  const term8 = await createExamWithSubjects("Term 1 Examination", current.id, grade8.id, termStart, [...core, "CS"]);
  await enterMarks(term8.id, s8a.id, studentsBySection.get(s8a.id)!, { skipSubjects: [subjects.MATH!], fraction: 1 });
  await createExamWithSubjects("Unit Test 2", current.id, grade6.id, addDays(today, 7), ["MATH", "SCI"]);

  // ── Fees ──
  const tuition = new Map<string, string>();
  for (const [klass, amount] of [
    [grade6, "450.00"],
    [grade7, "480.00"],
    [grade8, "500.00"],
  ] as const) {
    const fee = await fees.createFeeStructure(admin, {
      name: "Tuition – Term 1",
      academicSessionId: current.id,
      classId: klass.id,
      amount,
      frequency: "TERM",
      description: "First-term tuition",
      isActive: "on",
    });
    tuition.set(klass.id, fee.id);
  }
  const activity = await fees.createFeeStructure(admin, {
    name: "Annual Activity Fee",
    academicSessionId: current.id,
    amount: "75.00",
    frequency: "ANNUAL",
    description: "Sports, clubs and field trips",
    isActive: "on",
  });

  const tuitionIssue = addDays(today, -45) > sessionStart ? addDays(today, -45) : sessionStart;
  for (const feeId of tuition.values()) {
    await fees.generateInvoices(admin, {
      feeStructureId: feeId,
      periodLabel: "Term 1",
      issueDate: toDateOnlyString(tuitionIssue),
      dueDate: toDateOnlyString(addDays(tuitionIssue, 30)), // already past -> overdue when unpaid
    });
  }
  await fees.generateInvoices(admin, {
    feeStructureId: activity.id,
    periodLabel: `${startYear}-${startYear + 1}`,
    issueDate: toDateOnlyString(addDays(today, -10)),
    dueDate: toDateOnlyString(addDays(today, 20)),
  });

  // Payments: full, partial or none so balances, statuses and overdue lists are populated.
  const invoices = await prisma.invoice.findMany({ include: { items: true }, orderBy: { invoiceNumber: "asc" } });
  for (const [i, invoice] of invoices.entries()) {
    const isTuition = invoice.items.some((item) => item.periodLabel === "Term 1");
    const plan = isTuition ? i % 4 : i % 2 === 0 ? 2 : 0; // 0 unpaid, 1 partial, 2/3 full
    if (plan === 0) continue;
    const amountMinor = plan === 1 ? Math.round(invoice.totalMinor / 2) : invoice.totalMinor;
    const paidAt = addDays(invoice.issueDate, 3 + (i % 10));
    await fees.recordPayment(admin, {
      invoiceId: invoice.id,
      amount: (amountMinor / 100).toFixed(2),
      method: [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.CHEQUE][i % 3],
      paidAt: toDateOnlyString(paidAt > today ? today : paidAt),
      reference: i % 3 === 1 ? `TRX-${1000 + i}` : "",
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });
  }

  const counts = {
    users: await prisma.user.count(),
    students: await prisma.studentProfile.count(),
    attendance: await prisma.attendanceRecord.count(),
    marks: await prisma.mark.count(),
    invoices: await prisma.invoice.count(),
    payments: await prisma.payment.count(),
  };
  console.log("Seed complete:", counts);
  console.log(`Demo accounts (development only): admin@${DOMAIN}, teacher1@${DOMAIN}, student1@${DOMAIN}`);
  console.log("Password: the value of SEED_DEMO_PASSWORD in your .env file.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
