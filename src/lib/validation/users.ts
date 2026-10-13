import { z } from "zod";
import {
  checkboxField,
  emailField,
  idField,
  intField,
  optionalEmail,
  optionalPhone,
  optionalText,
  passwordField,
  requiredText,
} from "./common";

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required.").max(128),
});

export const createAdminSchema = z.object({
  name: requiredText("Name", 120),
  email: emailField,
  password: passwordField,
});

export const resetPasswordSchema = z.object({
  userId: idField("User"),
  password: passwordField,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required.").max(128),
    newPassword: passwordField,
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "The new password must be different from the current one.",
  });

const isSupportedCurrency = (code: string) => {
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
};

const isSupportedLocale = (locale: string) => {
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
};

export const settingsSchema = z.object({
  name: requiredText("Institution name", 120),
  address: optionalText(300),
  phone: optionalPhone,
  email: optionalEmail,
  currencyCode: requiredText("Currency", 3)
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code.")
    .refine(isSupportedCurrency, "Unknown currency code."),
  locale: requiredText("Locale", 20).refine(isSupportedLocale, "Unknown locale."),
  lateCountsAsPresent: checkboxField,
  excusedExcludedFromTotal: checkboxField,
  lowAttendanceThreshold: intField("Low attendance threshold", 0, 100),
  invoicePrefix: requiredText("Invoice prefix", 8)
    .toUpperCase()
    .regex(/^[A-Z0-9]+$/, "Use letters and numbers only."),
  receiptPrefix: requiredText("Receipt prefix", 8)
    .toUpperCase()
    .regex(/^[A-Z0-9]+$/, "Use letters and numbers only."),
});

export type SettingsInput = z.output<typeof settingsSchema>;
