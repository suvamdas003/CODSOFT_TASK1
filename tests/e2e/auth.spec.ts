import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./helpers";

test.describe("authentication", () => {
  test("signed-out visitors are sent to the login page", async ({ page }) => {
    await page.goto("/students");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to EduManage" })).toBeVisible();
  });

  test("a wrong password shows a generic error and does not sign in", async ({ page }) => {
    await signIn(page, DEMO.admin, "WrongPassword1");
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("protected API exports reject anonymous requests", async ({ request }) => {
    const response = await request.get("/api/reports/fees");
    expect(response.status()).toBe(401);
  });
});
