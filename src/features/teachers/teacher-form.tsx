"use client";

import Link from "next/link";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/shared/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionResult, FormValues } from "@/lib/action-result";
import { teacherStatusOptions } from "@/lib/options";

export type TeacherFormDefaults = Partial<
  Record<
    | "employeeId"
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "qualification"
    | "specialization"
    | "joiningDate"
    | "status",
    string
  >
>;

export function TeacherForm({
  action,
  defaults = {},
  mode,
  cancelHref,
}: {
  action: (values: FormValues) => Promise<ActionResult<unknown>>;
  defaults?: TeacherFormDefaults;
  mode: "create" | "edit";
  cancelHref: string;
}) {
  return (
    <ActionForm action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Teacher details</CardTitle>
          <CardDescription>The employee ID must be unique.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField name="employeeId" label="Employee ID" required maxLength={30} defaultValue={defaults.employeeId} />
          <SelectField
            name="status"
            label="Status"
            options={teacherStatusOptions}
            defaultValue={defaults.status ?? "ACTIVE"}
            description="Only active teachers can sign in and be assigned."
          />
          <TextField name="firstName" label="First name" required maxLength={60} defaultValue={defaults.firstName} />
          <TextField name="lastName" label="Last name" required maxLength={60} defaultValue={defaults.lastName} />
          <TextField name="phone" label="Phone" type="tel" maxLength={20} defaultValue={defaults.phone} />
          <TextField name="joiningDate" label="Joining date" type="date" required defaultValue={defaults.joiningDate} />
          <TextField name="qualification" label="Qualification" maxLength={120} defaultValue={defaults.qualification} />
          <TextField
            name="specialization"
            label="Specialization"
            maxLength={120}
            defaultValue={defaults.specialization}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sign-in account</CardTitle>
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
              description="At least 8 characters with a letter and a number."
            />
          ) : null}
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton>{mode === "create" ? "Create teacher" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
