import { expect, type Page } from "@playwright/test";

export const DEMO = {
  admin: "admin@demo.edumanage.test",
  teacher: "teacher1@demo.edumanage.test", // Maya Patel – Mathematics, class teacher of Grade 6 – A
  student: "student1@demo.edumanage.test", // Grade 6 – A
};

export const STATE = {
  admin: "tests/e2e/.auth/admin.json",
  teacher: "tests/e2e/.auth/teacher.json",
  student: "tests/e2e/.auth/student.json",
};

export function demoPassword(): string {
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) throw new Error("Set SEED_DEMO_PASSWORD (the password used by `npm run db:seed`).");
  return password;
}

export async function signIn(page: Page, email: string, password = demoPassword()) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Wait for the success toast shown by server-action forms. */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

export const uniqueSuffix = () => Date.now().toString(36).toUpperCase();
