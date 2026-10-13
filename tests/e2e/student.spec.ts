import { expect, test } from "@playwright/test";
import { STATE } from "./helpers";

test.use({ storageState: STATE.student });

test.describe("student workflows", () => {
  test("dashboard shows personal attendance, results and fees", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /^Welcome, / })).toBeVisible();
    await expect(page.getByText("Attendance", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Fees outstanding")).toBeVisible();
  });

  test("views a published report card", async ({ page }) => {
    await page.goto("/my/results");
    await expect(page.getByText("Term 1 Examination")).toBeVisible();
    await page.getByRole("link", { name: "View" }).first().click();
    await expect(page.getByRole("heading", { name: "Report card" })).toBeVisible();
    await expect(page.getByText("Overall grade")).toBeVisible();
  });

  test("sees own fees and receipts", async ({ page }) => {
    await page.goto("/my/fees");
    await expect(page.getByText("Payment history")).toBeVisible();
    await expect(page.getByRole("link", { name: /^INV-/ }).first()).toBeVisible();
  });

  test("cannot open staff pages or other students' records", async ({ page }) => {
    await page.goto("/students");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();

    // An invoice ID that is not the student's own is reported as not found.
    await page.goto("/fees/invoices/not-my-invoice-id");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const response = await page.request.get("/api/reports/fees");
    expect(response.status()).toBe(403);
  });
});
