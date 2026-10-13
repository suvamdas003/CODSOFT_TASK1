import type { Prisma } from "@/generated/prisma/client";

/**
 * Reusable Prisma `select` shapes. Selecting explicitly (instead of returning whole rows)
 * guarantees that private columns — password hashes, session tokens — never leave the
 * data layer, even by accident.
 */

export const sectionWithClassSelect = {
  id: true,
  name: true,
  classId: true,
  academicSessionId: true,
  class: { select: { id: true, name: true, level: true } },
  academicSession: { select: { id: true, name: true, isCurrent: true } },
} satisfies Prisma.SectionSelect;

export const studentListSelect = {
  id: true,
  admissionNumber: true,
  firstName: true,
  lastName: true,
  status: true,
  guardianName: true,
  guardianPhone: true,
  enrollmentDate: true,
  section: { select: sectionWithClassSelect },
  user: { select: { email: true } },
} satisfies Prisma.StudentProfileSelect;

export const studentDetailSelect = {
  ...studentListSelect,
  userId: true,
  dateOfBirth: true,
  gender: true,
  phone: true,
  address: true,
  guardianRelation: true,
  guardianEmail: true,
  sectionId: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { email: true, isActive: true, lastLoginAt: true } },
} satisfies Prisma.StudentProfileSelect;

export const teacherListSelect = {
  id: true,
  employeeId: true,
  firstName: true,
  lastName: true,
  phone: true,
  specialization: true,
  status: true,
  joiningDate: true,
  user: { select: { email: true } },
  _count: { select: { assignments: true } },
} satisfies Prisma.TeacherProfileSelect;

export const userAccountSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  studentProfile: { select: { id: true, admissionNumber: true } },
  teacherProfile: { select: { id: true, employeeId: true } },
} satisfies Prisma.UserSelect;
