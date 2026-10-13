import { NextResponse } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { isAppError } from "@/lib/errors";
import { toCsv } from "@/lib/utils/csv";
import { toDateOnlyString, todayDateOnlyString } from "@/lib/utils/dates";
import { fullName } from "@/lib/utils/format";
import { minorToMajorString } from "@/lib/utils/money";
import { requireActorOrThrow } from "@/server/auth/session";
import { listOverdueInvoices } from "@/server/services/fee.service";
import { getSettings } from "@/server/services/settings.service";

/** CSV export of overdue invoices (administrators only). */
export async function GET() {
  try {
    const actor = await requireActorOrThrow(Role.ADMIN);
    const [overdue, settings] = await Promise.all([listOverdueInvoices(actor), getSettings()]);
    const csv = toCsv(
      [
        "Invoice",
        "Admission number",
        "Student",
        "Class",
        "Due date",
        "Days overdue",
        `Balance (${settings.currencyCode})`,
      ],
      overdue.map((inv) => [
        inv.invoiceNumber,
        inv.student.admissionNumber,
        fullName(inv.student),
        inv.sectionName,
        toDateOnlyString(inv.dueDate),
        inv.daysOverdue,
        minorToMajorString(inv.outstandingMinor, settings.currencyCode),
      ]),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="overdue-invoices-${todayDateOnlyString()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    console.error("[fees csv] unexpected error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
