import type { FieldErrors } from "./errors";

/** Serializable result returned by every server action to the client. */
export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/** Plain object built from submitted form fields. Repeated names become arrays. */
export type FormValues = Record<string, string | string[]>;
