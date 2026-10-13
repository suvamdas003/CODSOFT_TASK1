import { expect, test as setup } from "@playwright/test";
import { DEMO, signIn, STATE } from "./helpers";

// Sign in once per role and reuse the session cookie in every spec (keeps the
// suite well under the sign-in rate limit).
for (const role of ["admin", "teacher", "student"] as const) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await signIn(page, DEMO[role]);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.context().storageState({ path: STATE[role] });
  });
}
