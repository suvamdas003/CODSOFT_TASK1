"use server";

import { Role } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { runAction } from "@/server/action";
import { saveAttendance } from "@/server/services/attendance.service";

/** Form fields: sectionId, date, status.<studentId>, remarks.<studentId>. */
export async function saveAttendanceAction(values: FormValues) {
  return runAction([Role.ADMIN, Role.TEACHER], async (actor) => {
    const entries = Object.keys(values)
      .filter((key) => key.startsWith("status."))
      .map((key) => {
        const studentId = key.slice("status.".length);
        return { studentId, status: values[key], remarks: values[`remarks.${studentId}`] };
      });
    const result = await saveAttendance(actor, { sectionId: values.sectionId, date: values.date, entries });
    return {
      message: `Attendance saved for ${result.saved} student${result.saved === 1 ? "" : "s"}.`,
      revalidate: ["/attendance", "/dashboard"],
    };
  });
}
