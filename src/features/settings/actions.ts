"use server";

import { Role } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { runAction } from "@/server/action";
import { deleteGradeScale, saveGradeScale, updateSettings } from "@/server/services/settings.service";

export async function updateSettingsAction(values: FormValues) {
  return runAction([Role.ADMIN], async (actor) => {
    await updateSettings(actor, values);
    return { message: "Settings saved.", revalidate: ["/", "/settings"] };
  });
}

/** Grade-scale editor (React Hook Form) submits a structured object with bands. */
export async function saveGradeScaleAction(scaleId: string | null, input: unknown) {
  return runAction([Role.ADMIN], async (actor) => {
    await saveGradeScale(actor, scaleId, input);
    return { message: "Grade scale saved.", revalidate: ["/settings"] };
  });
}

export async function deleteGradeScaleAction(scaleId: string) {
  return runAction([Role.ADMIN], async (actor) => {
    await deleteGradeScale(actor, scaleId);
    return { message: "Grade scale deleted.", revalidate: ["/settings"] };
  });
}
