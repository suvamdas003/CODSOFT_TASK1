"use client";

import Link from "next/link";
import {
  ActionForm,
  SelectField,
  SubmitButton,
  TextareaField,
  TextField,
  type Option,
} from "@/components/shared/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionResult, FormValues } from "@/lib/action-result";
import { genderOptions, studentStatusOptions } from "@/lib/options";

export type StudentFormDefaults = Partial<
  Record<
    | "admissionNumber"
    | "firstName"
    | "lastName"
    | "email"
    | "dateOfBirth"
    | "gender"
    | "phone"
    | "address"
    | "guardianName"
    | "guardianRelation"
    | "guardianPhone"
    | "guardianEmail"
    | "sectionId"
    | "enrollmentDate"
    | "status",
    string
  >
>;

export function StudentForm({
  action,
  defaults = {},
  sections,
  mode,
  cancelHref,
}: {
  action: (values: FormValues) => Promise<ActionResult<unknown>>;
  defaults?: StudentFormDefaults;
  sections: Option[];
  mode: "create" | "edit";
  cancelHref: string;
}) {
  return (
    <ActionForm action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Student details</CardTitle>
          <CardDescription>The admission number must be unique.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="admissionNumber"
            label="Admission number"
            required
            maxLength={30}
            defaultValue={defaults.admissionNumber}
          />
          <SelectField
            name="status"
            label="Status"
            options={studentStatusOptions}
            defaultValue={defaults.status ?? "ACTIVE"}
            description="Only active students can sign in."
          />
          <TextField
            name="firstName"
            label="First name"
            required
            maxLength={60}
            defaultValue={defaults.firstName}
            autoComplete="off"
          />
          <TextField
            name="lastName"
            label="Last name"
            required
            maxLength={60}
            defaultValue={defaults.lastName}
            autoComplete="off"
          />
          <TextField name="dateOfBirth" label="Date of birth" type="date" defaultValue={defaults.dateOfBirth} />
          <SelectField
            name="gender"
            label="Gender"
            options={genderOptions}
            defaultValue={defaults.gender ?? "UNDISCLOSED"}
          />
          <TextField name="phone" label="Phone" type="tel" maxLength={20} defaultValue={defaults.phone} />
          <TextareaField
            name="address"
            label="Address"
            maxLength={300}
            rows={2}
            defaultValue={defaults.address}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrollment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="sectionId"
            label="Class / section"
            options={sections}
            placeholder="Not assigned"
            defaultValue={defaults.sectionId ?? ""}
          />
          <TextField
            name="enrollmentDate"
            label="Enrollment date"
            type="date"
            required
            defaultValue={defaults.enrollmentDate}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guardian</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="guardianName"
            label="Guardian name"
            required
            maxLength={120}
            defaultValue={defaults.guardianName}
          />
          <TextField
            name="guardianRelation"
            label="Relation"
            required
            maxLength={40}
            placeholder="e.g. Mother"
            defaultValue={defaults.guardianRelation}
          />
          <TextField
            name="guardianPhone"
            label="Guardian phone"
            type="tel"
            required
            maxLength={20}
            defaultValue={defaults.guardianPhone}
          />
          <TextField
            name="guardianEmail"
            label="Guardian email"
            type="email"
            maxLength={254}
            defaultValue={defaults.guardianEmail}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign-in account</CardTitle>
          <CardDescription>The student signs in with this email address.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="email"
            label="Login email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            defaultValue={defaults.email}
          />
          {mode === "create" ? (
            <TextField
              name="password"
              label="Initial password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              description="At least 8 characters with a letter and a number. Share it securely."
            />
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton>{mode === "create" ? "Create student" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
