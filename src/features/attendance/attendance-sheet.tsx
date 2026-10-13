"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/shared/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils/cn";
import { saveAttendanceAction } from "./actions";

const STATUSES: { value: AttendanceStatus; label: string; short: string; tone: string }[] = [
  { value: "PRESENT", label: "Present", short: "P", tone: "peer-checked:bg-success peer-checked:text-white" },
  { value: "LATE", label: "Late", short: "L", tone: "peer-checked:bg-warning peer-checked:text-white" },
  { value: "ABSENT", label: "Absent", short: "A", tone: "peer-checked:bg-destructive peer-checked:text-white" },
  {
    value: "EXCUSED",
    label: "Excused",
    short: "E",
    tone: "peer-checked:bg-primary peer-checked:text-primary-foreground",
  },
];

type Row = {
  student: { id: string; admissionNumber: string; firstName: string; lastName: string };
  record: { status: AttendanceStatus; remarks: string | null } | null;
};

export function AttendanceSheet({
  sectionId,
  date,
  rows,
  disabled,
}: {
  sectionId: string;
  date: string;
  rows: Row[];
  disabled: boolean;
}) {
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(rows.map((r) => [r.student.id, r.record?.status ?? "PRESENT"])),
  );
  const counts = STATUSES.map((s) => ({ ...s, count: Object.values(statuses).filter((v) => v === s.value).length }));
  const markAll = (status: AttendanceStatus) =>
    setStatuses(Object.fromEntries(rows.map((r) => [r.student.id, status])));

  return (
    <ActionForm action={saveAttendanceAction}>
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {counts.map((c) => `${c.label}: ${c.count}`).join(" · ")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => markAll("PRESENT")} disabled={disabled}>
            Mark all present
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => markAll("ABSENT")} disabled={disabled}>
            Mark all absent
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Remarks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ student, record }) => (
            <TableRow key={student.id}>
              <TableCell>
                <span className="font-medium">
                  {student.firstName} {student.lastName}
                </span>
                <div className="text-muted-foreground font-mono text-xs">{student.admissionNumber}</div>
              </TableCell>
              <TableCell>
                <fieldset className="flex gap-1" disabled={disabled}>
                  <legend className="sr-only">
                    Attendance for {student.firstName} {student.lastName}
                  </legend>
                  {STATUSES.map((s) => (
                    <label key={s.value} className="relative">
                      <input
                        type="radio"
                        name={`status.${student.id}`}
                        value={s.value}
                        checked={statuses[student.id] === s.value}
                        onChange={() => setStatuses((prev) => ({ ...prev, [student.id]: s.value }))}
                        className="peer sr-only"
                      />
                      <span
                        title={s.label}
                        className={cn(
                          "peer-focus-visible:ring-ring grid h-8 w-9 cursor-pointer place-items-center rounded-md border text-xs font-semibold transition-colors peer-focus-visible:ring-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                          s.tone,
                        )}
                      >
                        {s.short}
                        <span className="sr-only">{s.label}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Input
                  name={`remarks.${student.id}`}
                  defaultValue={record?.remarks ?? ""}
                  maxLength={200}
                  placeholder="Optional"
                  aria-label={`Remarks for ${student.firstName} ${student.lastName}`}
                  disabled={disabled}
                  className="h-8"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-end">
        <SubmitButton disabled={disabled}>Save attendance</SubmitButton>
      </div>
    </ActionForm>
  );
}
