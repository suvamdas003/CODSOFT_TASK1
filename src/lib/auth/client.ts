"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side Better Auth client (same-origin /api/auth endpoints). */
export const authClient = createAuthClient();
