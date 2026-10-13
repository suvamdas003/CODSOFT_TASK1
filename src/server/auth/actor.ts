import type { Role } from "@/generated/prisma/enums";

/**
 * The authenticated principal performing an operation. Every service function that
 * reads or changes sensitive data receives an Actor and authorizes against it, so
 * permissions are enforced on the server regardless of which UI triggered the call.
 */
export type Actor = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  /** StudentProfile.id when role = STUDENT */
  studentId: string | null;
  /** TeacherProfile.id when role = TEACHER */
  teacherId: string | null;
};
