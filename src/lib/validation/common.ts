import { z } from "zod";
import { isDateOnlyString, parseDateOnly } from "@/lib/utils/dates";

/** Treat "", null and undefined the same: "not provided". */
const blankToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;

export const requiredText = (label: string, max = 120) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters.`)
    .nullish()
    .transform((value) => (value ? value : null));

export const idField = (label = "Selection") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(64);

export const optionalId = () =>
  z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((value) => (value ? value : null));

export const emailField = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .min(1, "Email is required.")
  .max(254)
  .pipe(z.email({ error: "Enter a valid email address." }));

export const optionalEmail = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ error: "Enter a valid email address." }))
    .optional()
    .transform((value) => value ?? null),
);

const PHONE = /^\+?[0-9][0-9\s()-]{5,19}$/;

export const phoneField = (label = "Phone") => requiredText(label, 20).regex(PHONE, "Enter a valid phone number.");

export const optionalPhone = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .regex(PHONE, "Enter a valid phone number.")
    .optional()
    .transform((value) => value ?? null),
);

export const passwordField = z
  .string({ error: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const dateField = (label = "Date") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .refine(isDateOnlyString, `Enter a valid ${label.toLowerCase()}.`)
    .transform(parseDateOnly);

export const optionalDate = (label = "date") =>
  z
    .string()
    .trim()
    .nullish()
    .refine((value) => !value || isDateOnlyString(value), `Enter a valid ${label}.`)
    .transform((value) => (value ? parseDateOnly(value) : null));

export const intField = (label: string, min: number, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: `${label} is required.` })
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max}.`),
  );

export const optionalInt = (label: string, min: number, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int(`${label} must be a whole number.`)
      .min(min, `${label} must be at least ${min}.`)
      .max(max, `${label} must be at most ${max}.`)
      .optional()
      .transform((value) => value ?? null),
  );

/** HTML checkboxes submit "on" when checked and nothing otherwise. */
export const checkboxField = z.preprocess((value) => value === true || value === "on" || value === "true", z.boolean());

/** Decimal amount in major currency units, e.g. "1250.50". Converted to minor units in services. */
export const amountField = (label = "Amount") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .regex(/^\d{1,9}(\.\d{1,3})?$/, `${label} must be a positive number.`);
