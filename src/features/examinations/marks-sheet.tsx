"use client";

import { useState } from "react";
import { ActionForm, FieldError, SubmitButton, useFieldInvalid } from "@/components/shared/action-form";
import { Checkbox, Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveMarksAction } from "./actions";

type Row = {
  student: { id: string; admissionNumber: string; firstName: string; lastName: string };
  marks: string;
  isAbsent: boolean;
  remarks: string;
};

function MarkInput({
  row,
  maxMarks,
  absent,
  disabled,
}: {
  row: Row;
  maxMarks: number;
  absent: boolean;
  disabled: boolean;
}) {
  const name = `marks.${row.student.id}`;
  const invalid = useFieldInvalid(name);
  return (
    <>
      <Input
        name={name}
        type="number"
        inputMode="decimal"
        min={0}
        max={maxMarks}
        step="0.01"
        defaultValue={row.marks}
        disabled={disabled || absent}
        aria-invalid={invalid}
        aria-label={`Marks for ${row.student.firstName} ${row.student.lastName}`}
        className="h-8 w-24"
      />
      {/* Absent rows still submit an (empty) marks field so the server sees every student. */}
      {absent ? <input type="hidden" name={name} value="" /> : null}
      <FieldError name={name} />
    </>
  );
}

export function MarksSheet({
  examSubjectId,
  sectionId,
  maxMarks,
  rows,
  locked,
}: {
  examSubjectId: string;
  sectionId: string;
  maxMarks: number;
  rows: Row[];
  locked: boolean;
}) {
  const [absent, setAbsent] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.student.id, r.isAbsent])),
  );
  return (
    <ActionForm action={saveMarksAction}>
      <input type="hidden" name="examSubjectId" value={examSubjectId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Marks (max {maxMarks})</TableHead>
            <TableHead>Absent</TableHead>
            <TableHead className="hidden md:table-cell">Remarks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.student.id}>
              <TableCell>
                <span className="font-medium">
                  {row.student.firstName} {row.student.lastName}
                </span>
                <div className="text-muted-foreground font-mono text-xs">{row.student.admissionNumber}</div>
              </TableCell>
              <TableCell>
                <MarkInput row={row} maxMarks={maxMarks} absent={absent[row.student.id] ?? false} disabled={locked} />
              </TableCell>
              <TableCell>
                <Checkbox
                  name={`absent.${row.student.id}`}
                  checked={absent[row.student.id] ?? false}
                  onChange={(e) => setAbsent((prev) => ({ ...prev, [row.student.id]: e.target.checked }))}
                  disabled={locked}
                  aria-label={`${row.student.firstName} ${row.student.lastName} was absent`}
                />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Input
                  name={`remarks.${row.student.id}`}
                  defaultValue={row.remarks}
                  maxLength={200}
                  disabled={locked}
                  placeholder="Optional"
                  aria-label={`Remarks for ${row.student.firstName} ${row.student.lastName}`}
                  className="h-8"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground text-xs">
        Leave a mark blank to clear it. Up to two decimal places are allowed.
      </p>
      <div className="flex justify-end">
        <SubmitButton disabled={locked}>Save marks</SubmitButton>
      </div>
    </ActionForm>
  );
}
