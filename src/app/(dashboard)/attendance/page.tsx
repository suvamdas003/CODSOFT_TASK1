import { FileBarChartIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Role } from "@/generated/prisma/enums";
import { AttendanceSheet } from "@/features/attendance/attendance-sheet";
import { formatDate, isDateOnlyString, parseDateOnly, todayDateOnlyString } from "@/lib/utils/dates";
import { param } from "@/lib/utils/pagination";
import { requireActor } from "@/server/auth/session";
import { load } from "@/server/page";
import { sectionOptions } from "@/server/services/academics.service";
import { getAttendanceSheet } from "@/server/services/attendance.service";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const actor = await requireActor(Role.ADMIN, Role.TEACHER);
  const sp = await searchParams;
  const sections = await sectionOptions(actor);
  const sectionId = param(sp.sectionId);
  const requestedDate = param(sp.date);
  const date = requestedDate && isDateOnlyString(requestedDate) ? requestedDate : todayDateOnlyString();
  const sheet = sectionId ? await load(getAttendanceSheet(actor, sectionId, parseDateOnly(date))) : null;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Record daily attendance for a class section. Saving again updates the same day's records."
        actions={
          <Button asChild variant="outline">
            <Link href="/attendance/report">
              <FileBarChartIcon aria-hidden /> Attendance report
            </Link>
          </Button>
        }
      />
      <Card className="mb-6">
        <CardContent className="pt-5">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="sectionId">Section</Label>
              <NativeSelect id="sectionId" name="sectionId" defaultValue={sectionId ?? ""} required>
                <option value="" disabled>
                  Choose a section
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" name="date" defaultValue={date} max={todayDateOnlyString()} required />
            </div>
            <Button type="submit">Load roster</Button>
          </form>
        </CardContent>
      </Card>

      {sections.length === 0 ? (
        <EmptyState
          title="No sections available"
          description={
            actor.role === Role.TEACHER
              ? "You are not assigned to any section in the current session."
              : "Create sections for the current session first."
          }
        />
      ) : !sheet ? (
        <EmptyState title="Choose a section and date" description="The class roster will appear here." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {sheet.section.label} · {formatDate(sheet.date)}
            </CardTitle>
            <CardDescription>
              {sheet.alreadyRecorded
                ? `Attendance already recorded${sheet.lastRecordedBy ? ` by ${sheet.lastRecordedBy}` : ""}. Saving will update it.`
                : "Not recorded yet. Everyone defaults to Present."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sheet.isFuture ? <Alert variant="warning">Attendance cannot be recorded for a future date.</Alert> : null}
            {!sheet.withinSession ? (
              <Alert variant="warning">This date is outside the {sheet.section.sessionName} session.</Alert>
            ) : null}
            {sheet.rows.length === 0 ? (
              <EmptyState title="No active students in this section on this date" />
            ) : (
              <AttendanceSheet
                key={`${sheet.section.id}-${date}`}
                sectionId={sheet.section.id}
                date={date}
                rows={sheet.rows}
                disabled={sheet.isFuture || !sheet.withinSession}
              />
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
