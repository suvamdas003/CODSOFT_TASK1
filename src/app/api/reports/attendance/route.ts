import { NextResponse, type NextRequest } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { isAppError } from "@/lib/errors";
import { toCsv } from "@/lib/utils/csv";
import { toDateOnlyString } from "@/lib/utils/dates";
import { requireActorOrThrow } from "@/server/auth/session";
import { getSectionAttendanceReport } from "@/server/services/attendance.service";

const STATUS: Record<string, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
};

/** CSV export of the section attendance report (same authorization as the page). */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireActorOrThrow(Role.ADMIN, Role.TEACHER);
    const sp = request.nextUrl.searchParams;
    const report = await getSectionAttendanceReport(actor, {
      sectionId: sp.get("sectionId") ?? "",
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
    });
    const csv = toCsv(
      ["Admission number", "Student", "Present", "Late", "Absent", "Excused", "Days recorded", "Attendance %"],
      report.students.map((r) => [
        r.student.admissionNumber,
        r.name,
        r.counts.PRESENT,
        r.counts.LATE,
        r.counts.ABSENT,
        r.counts.EXCUSED,
        r.total,
        r.percentage ?? "",
      ]),
    );
    const filename = `attendance-${toDateOnlyString(report.from)}-to-${toDateOnlyString(report.to)}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: STATUS[error.code] ?? 400 });
    console.error("[attendance csv] unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
