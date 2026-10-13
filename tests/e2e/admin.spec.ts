import { expect, test } from "@playwright/test";
import { expectToast, STATE, uniqueSuffix } from "./helpers";

test.use({ storageState: STATE.admin });

test.describe("administrator workflows", () => {
  test("dashboard shows live institution metrics", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Administrator dashboard" })).toBeVisible();
    await expect(page.getByText("Active students")).toBeVisible();
    await expect(page.getByText("Outstanding fees")).toBeVisible();
    await expect(page.getByText("Daily attendance rate")).toBeVisible();
  });

  test("creates a student, rejects a duplicate admission number, then finds the student", async ({ page }) => {
    const suffix = uniqueSuffix();
    const admission = `E2E-${suffix}`;

    const fill = async (admissionNumber: string, email: string) => {
      await page.goto("/students/new");
      await page.getByLabel("Admission number").fill(admissionNumber);
      await page.getByLabel("First name").fill("Playwright");
      await page.getByLabel("Last name").fill(`Tester ${suffix}`);
      await page.getByLabel("Class / section").selectOption({ label: "Grade 6 – B" });
      await page.getByLabel("Guardian name").fill("Robot Guardian");
      await page.getByLabel("Relation").fill("Guardian");
      await page.getByLabel("Guardian phone").fill("+1 555 0199");
      await page.getByLabel("Login email").fill(email);
      await page.getByLabel("Initial password").fill("Student123");
      await page.getByRole("button", { name: "Create student" }).click();
    };

    await fill(admission, `e2e-${suffix.toLowerCase()}@demo.edumanage.test`);
    await expectToast(page, "Student created.");
    await expect(page.getByRole("heading", { name: `Playwright Tester ${suffix}` })).toBeVisible();

    await fill(admission, `e2e-dup-${suffix.toLowerCase()}@demo.edumanage.test`);
    await expect(page.getByText("Admission number must be unique.", { exact: true })).toBeVisible();

    await page.goto(`/students?q=${encodeURIComponent(suffix)}`);
    await expect(page.getByRole("link", { name: `Playwright Tester ${suffix}` })).toBeVisible();
  });

  test("issues an invoice and records a manual payment with a printable receipt", async ({ page }) => {
    await page.goto("/fees/invoices/new");
    await page.getByLabel("Student").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Description").fill(`E2E charge ${uniqueSuffix()}`);
    await page.getByLabel(/Amount/).fill("12.50");
    await page.getByRole("button", { name: "Issue invoice" }).click();
    await expect(page).toHaveURL(/\/fees\/invoices\/[^/]+$/);
    // Wait for the invoice page itself (the previous form also shows an Amount field).
    await expect(page.getByRole("heading", { name: "Record payment" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Invoice INV-/ })).toBeVisible();

    // Overpayment is rejected by the server.
    await page.getByLabel(/^Amount/).fill("20.00");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/exceeds the outstanding balance/).first()).toBeVisible();

    await page.getByLabel(/^Amount/).fill("12.50");
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page).toHaveURL(/\/fees\/receipts\/[^/]+$/);
    await expect(page.getByText("Amount received")).toBeVisible();
    await expect(page.getByText(/not processed by an online payment/)).toBeVisible();
  });

  test("opens reports and the audit log", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Examination performance" })).toBeVisible();
    await page.goto("/audit-log");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("Recorded manual payment").first()).toBeVisible();
  });
});
