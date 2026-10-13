import { SelectField, TextField, type Option } from "@/components/shared/action-form";

export function ExamFields({
  sessions,
  classes,
  scales,
  defaults = {},
}: {
  sessions: Option[];
  classes: Option[];
  scales: Option[];
  defaults?: Partial<
    Record<"name" | "academicSessionId" | "classId" | "gradeScaleId" | "startDate" | "endDate", string>
  >;
}) {
  return (
    <>
      <TextField
        name="name"
        label="Exam name"
        required
        maxLength={80}
        placeholder="e.g. Term 1 Examination"
        defaultValue={defaults.name}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="academicSessionId"
          label="Session"
          required
          options={sessions}
          defaultValue={defaults.academicSessionId}
        />
        <SelectField
          name="classId"
          label="Class"
          required
          options={classes}
          placeholder="Choose a class"
          defaultValue={defaults.classId ?? ""}
        />
        <SelectField
          name="gradeScaleId"
          label="Grade scale"
          required
          options={scales}
          defaultValue={defaults.gradeScaleId}
        />
        <div />
        <TextField name="startDate" label="Start date" type="date" defaultValue={defaults.startDate} />
        <TextField name="endDate" label="End date" type="date" defaultValue={defaults.endDate} />
      </div>
    </>
  );
}

export function ExamSubjectFields({
  subjects,
  defaults = {},
}: {
  subjects: Option[];
  defaults?: Partial<Record<"subjectId" | "maxMarks" | "passMarks" | "examDate", string>>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        name="subjectId"
        label="Subject"
        required
        options={subjects}
        placeholder="Choose a subject"
        defaultValue={defaults.subjectId ?? ""}
        className="sm:col-span-2"
      />
      <TextField
        name="maxMarks"
        label="Maximum marks"
        type="number"
        required
        min={1}
        max={1000}
        defaultValue={defaults.maxMarks ?? "100"}
      />
      <TextField
        name="passMarks"
        label="Pass marks"
        type="number"
        required
        min={0}
        max={1000}
        defaultValue={defaults.passMarks ?? "35"}
      />
      <TextField name="examDate" label="Exam date" type="date" defaultValue={defaults.examDate} />
    </div>
  );
}
