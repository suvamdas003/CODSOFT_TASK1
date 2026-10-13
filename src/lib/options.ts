import {
  AttendanceStatus,
  FeeFrequency,
  Gender,
  InvoiceStatus,
  PaymentMethod,
  Role,
  StudentStatus,
  TeacherStatus,
} from "@/generated/prisma/enums";
import { humanize } from "./utils/format";

const enumOptions = (values: Record<string, string>) =>
  Object.values(values).map((value) => ({ value, label: humanize(value) }));

export const genderOptions = enumOptions(Gender);
export const studentStatusOptions = enumOptions(StudentStatus);
export const teacherStatusOptions = enumOptions(TeacherStatus);
export const attendanceStatusOptions = enumOptions(AttendanceStatus);
export const feeFrequencyOptions = enumOptions(FeeFrequency);
export const invoiceStatusOptions = enumOptions(InvoiceStatus);
export const paymentMethodOptions = enumOptions(PaymentMethod);
export const roleOptions = enumOptions(Role);

export function isEnumValue<T extends Record<string, string>>(values: T, value: unknown): value is T[keyof T] {
  return typeof value === "string" && (Object.values(values) as string[]).includes(value);
}
