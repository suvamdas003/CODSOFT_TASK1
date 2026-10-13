"use server";

import { Role } from "@/generated/prisma/enums";
import type { FormValues } from "@/lib/action-result";
import { runAction } from "@/server/action";
import { createAdminUser, resetUserPassword, setUserActive } from "@/server/services/user.service";

export async function createAdminAction(values: FormValues) {
  return runAction([Role.ADMIN], async (actor) => {
    await createAdminUser(actor, values);
    return { message: "Administrator account created.", revalidate: ["/users"] };
  });
}

export async function setUserActiveAction(userId: string, isActive: boolean) {
  return runAction([Role.ADMIN], async (actor) => {
    await setUserActive(actor, userId, isActive);
    return { message: isActive ? "Sign-in enabled." : "Sign-in disabled and sessions ended.", revalidate: ["/users"] };
  });
}

export async function resetPasswordAction(values: FormValues) {
  return runAction([Role.ADMIN], async (actor) => {
    await resetUserPassword(actor, values);
    return { message: "Password reset. The user has been signed out everywhere.", revalidate: ["/users"] };
  });
}
