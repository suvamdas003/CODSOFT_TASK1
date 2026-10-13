import { describe, expect, it } from "vitest";
import { AppError, parseInput } from "@/lib/errors";
import { saveMarksSchema } from "@/lib/validation/exams";
import { createInvoiceSchema, recordPaymentSchema } from "@/lib/validation/fees";
import { createStudentSchema } from "@/lib/validation/people";
import { changePasswordSchema, loginSchema } from "@/lib/validation/users";

const validStudent = {
  admissionNumber: "adm-001",
  firstName: " Ana ",
  lastName: "Lopez",
  email: "ANA@School.TEST",
  password: "Secret123",
  guardianName: "Maria Lopez",
  guardianRelation: "Mother",
  guardianPhone: "+1 555 0100",
  enrollmentDate: "2026-04-01",
  sectionId: "",
  guardianEmail: "",
};

describe("student validation", () => {
  it("normalizes input (trim, upper-case admission number, lower-case email, blanks to null)", () => {
    const data = parseInput(createStudentSchema, validStudent);
    expect(data.admissionNumber).toBe("ADM-001");
    expect(data.firstName).toBe("Ana");
    expect(data.email).toBe("ana@school.test");
    expect(data.sectionId).toBeNull();
    expect(data.guardianEmail).toBeNull();
    expect(data.enrollmentDate.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("reports field errors for missing and invalid fields", () => {
    try {
      parseInput(createStudentSchema, {
        ...validStudent,
        firstName: "",
        email: "not-an-email",
        password: "short",
        guardianPhone: "abc",
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const fields = (error as AppError).fieldErrors!;
      expect(Object.keys(fields)).toEqual(expect.arrayContaining(["firstName", "email", "password", "guardianPhone"]));
    }
  });

  it("rejects future dates of birth and invalid calendar dates", () => {
    expect(() => parseInput(createStudentSchema, { ...validStudent, dateOfBirth: "2999-01-01" })).toThrow(AppError);
    expect(() => parseInput(createStudentSchema, { ...validStudent, enrollmentDate: "2026-02-31" })).toThrow(AppError);
  });

  it("rejects admission numbers with unsafe characters", () => {
    expect(() => parseInput(createStudentSchema, { ...validStudent, admissionNumber: "<script>" })).toThrow(AppError);
  });
});

describe("marks validation", () => {
  it("accepts blank or numeric marks with up to two decimals", () => {
    const data = parseInput(saveMarksSchema, {
      examSubjectId: "es1",
      sectionId: "s1",
      entries: [
        { studentId: "a", marks: "45.5", isAbsent: "" },
        { studentId: "b", marks: "", isAbsent: "on" },
      ],
    });
    expect(data.entries[1]!.isAbsent).toBe(true);
  });

  it("rejects negative, non-numeric, overly precise marks and duplicate students", () => {
    for (const marks of ["-1", "abc", "10.555"]) {
      expect(() =>
        parseInput(saveMarksSchema, { examSubjectId: "e", sectionId: "s", entries: [{ studentId: "a", marks }] }),
      ).toThrow(AppError);
    }
    expect(() =>
      parseInput(saveMarksSchema, {
        examSubjectId: "e",
        sectionId: "s",
        entries: [
          { studentId: "a", marks: "1" },
          { studentId: "a", marks: "2" },
        ],
      }),
    ).toThrow(AppError);
  });
});

describe("fee validation", () => {
  it("requires due date on or after issue date and at least one item", () => {
    expect(() =>
      parseInput(createInvoiceSchema, {
        studentId: "s",
        issueDate: "2026-10-10",
        dueDate: "2026-10-01",
        items: [{ description: "x", amount: "1" }],
      }),
    ).toThrow(AppError);
    expect(() =>
      parseInput(createInvoiceSchema, { studentId: "s", issueDate: "2026-10-01", dueDate: "2026-10-10", items: [] }),
    ).toThrow(AppError);
  });

  it("requires a valid idempotency key and positive amount for payments", () => {
    const base = {
      invoiceId: "i",
      amount: "10.00",
      method: "CASH",
      paidAt: "2026-10-01",
      idempotencyKey: "0b6d5e0a-1f7a-4c0e-9a51-2a4b8e6f7c11",
    };
    expect(parseInput(recordPaymentSchema, base).amount).toBe("10.00");
    expect(() => parseInput(recordPaymentSchema, { ...base, idempotencyKey: "abc" })).toThrow(AppError);
    expect(() => parseInput(recordPaymentSchema, { ...base, amount: "-3" })).toThrow(AppError);
    expect(() => parseInput(recordPaymentSchema, { ...base, method: "BITCOIN" })).toThrow(AppError);
  });
});

describe("auth validation", () => {
  it("validates login and password change input", () => {
    expect(() => parseInput(loginSchema, { email: "x", password: "" })).toThrow(AppError);
    expect(() =>
      parseInput(changePasswordSchema, {
        currentPassword: "Old12345",
        newPassword: "New12345",
        confirmPassword: "Other123",
      }),
    ).toThrow(AppError);
    expect(() =>
      parseInput(changePasswordSchema, {
        currentPassword: "Same1234",
        newPassword: "Same1234",
        confirmPassword: "Same1234",
      }),
    ).toThrow(AppError);
    expect(
      parseInput(changePasswordSchema, {
        currentPassword: "Old12345",
        newPassword: "New12345",
        confirmPassword: "New12345",
      }).newPassword,
    ).toBe("New12345");
  });
});
