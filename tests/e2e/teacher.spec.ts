import { expect, test } from "@playwright/test";
import { expectToast, STATE } from "./helpers";

test.use({ storageState: STATE.teacher });

test.describe("teacher workflows", () => {
  test("dashboard lists assigned classes and tasks", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Welcome, Maya" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My classes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Examination tasks" })).toBeVisible();
  });

  test("records attendance for an assigned section", async ({ page }) => {
    await page.goto("/attendance");
    await page.getByLabel("Section").selectOption({ label: "Grade 6 – A" });
    await page.getByRole("button", { name: "Load roster" }).click();
    await expect(page.getByRole("button", { name: "Mark all present" })).toBeVisible();
    await page.getByRole("button", { name: "Mark all present" }).click();
    await page.getByRole("button", { name: "Save attendance" }).click();
    await expectToast(page, /Attendance saved for \d+ students?/);
  });

  test("marks above the maximum are rejected, valid marks are saved", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Enter marks" }).first().click();
    await expect(page).toHaveURL(/\/marks\?/);
    const firstMark = page.getByLabel(/^Marks for /).first();
    // The browser blocks out-of-range input (max attribute); the server enforces the same
    // rule independently (covered by the integration tests).
    await firstMark.fill("150");
    await page.getByRole("button", { name: "Save marks" }).click();
    expect(await firstMark.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow)).toBe(true);

    // Bypass browser validation to prove the server rejects it too.
    await page
      .locator("form")
      .filter({ has: firstMark })
      .evaluate((form: HTMLFormElement) => form.setAttribute("novalidate", ""));
    await page.getByRole("button", { name: "Save marks" }).click();
    await expect(page.getByText("Cannot exceed 100.")).toBeVisible();

    await firstMark.fill("72.5");
    await page.getByRole("button", { name: "Save marks" }).click();
    await expectToast(page, /Saved \d+ mark/);
  });

  test("cannot open administrator pages", async ({ page }) => {
    await page.goto("/fees");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });
});
