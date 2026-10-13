import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StudentStatus } from "@/generated/prisma/enums";
import { parsePagination } from "@/lib/utils/pagination";
import { prisma } from "@/server/db";
import {
  createStudent,
  getStudent,
  listStudents,
  setStudentStatus,
  updateStudent,
} from "@/server/services/student.service";
import { createSchool, expectAppError, studentInput } from "./fixtures";

let school: Awaited<ReturnType<typeof createSchool>>;

beforeAll(async () => {
  school = await createSchool();
});
afterAll(() => prisma.$disconnect());

describe("student CRUD", () => {
  it("creates a student with a sign-in account and never stores the plain password", async () => {
    const input = studentInput({ sectionId: school.sectionA.id, firstName: "Ana", lastName: "Lopez" });
    const id = await createStudent(school.admin, input);
    const student = await getStudent(school.admin, id);
    expect(student.admissionNumber).toBe(input.admissionNumber.toUpperCase()); // normalized
    expect(student.section?.id).toBe(school.sectionA.id);
    expect(student.user.email).toBe(input.email);

    const account = await prisma.account.findFirstOrThrow({ where: { userId: student.userId } });
    expect(account.providerId).toBe("credential");
    expect(account.password).toBeTruthy();
    expect(account.password).not.toContain(input.password);
    // The detail view never exposes password hashes.
    expect(JSON.stringify(student)).not.toContain(account.password!);
  });

  it("rejects duplicate admission numbers with a field error", async () => {
    const first = studentInput();
    await createStudent(school.admin, first);
    const error = await expectAppError(
      createStudent(school.admin, studentInput({ admissionNumber: first.admissionNumber })),
      "CONFLICT",
    );
    expect(error.fieldErrors?.admissionNumber).toBeDefined();
    // Case-insensitive: admission numbers are normalized to upper case.
    await expectAppError(
      createStudent(school.admin, studentInput({ admissionNumber: first.admissionNumber.toLowerCase() })),
      "CONFLICT",
    );
  });

  it("rejects duplicate login emails", async () => {
    const first = studentInput();
    await createStudent(school.admin, first);
    const error = await expectAppError(
      createStudent(school.admin, studentInput({ email: first.email.toUpperCase() })),
      "CONFLICT",
    );
    expect(error.fieldErrors?.email).toBeDefined();
  });

  it("validates required fields", async () => {
    const error = await expectAppError(
      createStudent(school.admin, studentInput({ firstName: "", guardianPhone: "" })),
      "VALIDATION",
    );
    expect(Object.keys(error.fieldErrors ?? {})).toEqual(expect.arrayContaining(["firstName", "guardianPhone"]));
  });

  it("enforces section capacity", async () => {
    const { createSection } = await import("@/server/services/academics.service");
    const tiny = await createSection(school.admin, {
      classId: school.klass.id,
      academicSessionId: school.session.id,
      name: "TINY",
      capacity: "1",
    });
    await createStudent(school.admin, studentInput({ sectionId: tiny.id }));
    await expectAppError(createStudent(school.admin, studentInput({ sectionId: tiny.id })), "VALIDATION");
  });

  it("updates a student and keeps the account name and email in sync", async () => {
    const input = studentInput({ sectionId: school.sectionA.id });
    const id = await createStudent(school.admin, input);
    // The update schema strips unknown keys, so the create-only password field is ignored.
    await updateStudent(school.admin, id, {
      ...input,
      firstName: "Renamed",
      email: `renamed-${input.email}`,
      sectionId: school.sectionB.id,
    });
    const student = await getStudent(school.admin, id);
    expect(student.firstName).toBe("Renamed");
    expect(student.section?.id).toBe(school.sectionB.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    expect(user.name.startsWith("Renamed")).toBe(true);
    expect(user.email).toBe(`renamed-${input.email}`);
  });

  it("deactivates (soft-deletes) a student, disables sign-in and ends sessions", async () => {
    const id = await createStudent(school.admin, studentInput());
    const student = await prisma.studentProfile.findUniqueOrThrow({ where: { id } });
    await prisma.session.create({
      data: { token: `tok-${id}`, userId: student.userId, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    await setStudentStatus(school.admin, id, StudentStatus.INACTIVE);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    expect(user.isActive).toBe(false);
    expect(await prisma.session.count({ where: { userId: student.userId } })).toBe(0);
    // The record itself is retained.
    expect((await prisma.studentProfile.findUniqueOrThrow({ where: { id } })).status).toBe(StudentStatus.INACTIVE);

    await setStudentStatus(school.admin, id, StudentStatus.ACTIVE);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: student.userId } })).isActive).toBe(true);
  });

  it("searches, filters and paginates", async () => {
    await createStudent(
      school.admin,
      studentInput({ firstName: "Zebulon", lastName: "Searchable", sectionId: school.sectionB.id }),
    );
    const byName = await listStudents(school.admin, { q: "zebul" }, parsePagination());
    expect(byName.items.map((s) => s.firstName)).toEqual(["Zebulon"]);

    const bySection = await listStudents(school.admin, { sectionId: school.sectionB.id }, parsePagination());
    expect(bySection.items.every((s) => s.section?.id === school.sectionB.id)).toBe(true);

    const page = await listStudents(school.admin, {}, parsePagination("1", "2"));
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    expect(page.pageCount).toBe(Math.ceil(page.total / 2));
  });
});

describe("student management permissions", () => {
  it("only administrators can create, update or deactivate students", async () => {
    await expectAppError(createStudent(school.teacher, studentInput()), "FORBIDDEN");
    const id = await createStudent(school.admin, studentInput());
    await expectAppError(updateStudent(school.teacher, id, studentInput()), "FORBIDDEN");
    await expectAppError(setStudentStatus(school.teacher, id, StudentStatus.INACTIVE), "FORBIDDEN");
  });

  it("teachers only see students in sections they teach", async () => {
    const result = await listStudents(school.teacher, {}, parsePagination("1", "100"));
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((s) => s.section?.id === school.sectionA.id)).toBe(true);
    // Filtering to another section cannot widen the scope.
    const other = await listStudents(school.teacher, { sectionId: school.sectionB.id }, parsePagination());
    expect(other.total).toBe(0);
  });
});
