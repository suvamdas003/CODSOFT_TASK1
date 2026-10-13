import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TeacherStatus } from "@/generated/prisma/enums";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { setTeacherStatus } from "@/server/services/teacher.service";
import { setUserActive } from "@/server/services/user.service";
import { createSchool, createStudentActor, expectAppError, TEST_PASSWORD } from "./fixtures";

/**
 * Exercises the real Better Auth HTTP handler (the same one mounted at /api/auth)
 * against the test database.
 */
const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function signIn(email: string, password: string, ip = "203.0.113.10") {
  return auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    }),
  );
}

let school: Awaited<ReturnType<typeof createSchool>>;

beforeAll(async () => {
  school = await createSchool();
});
afterAll(() => prisma.$disconnect());

describe("sign-in", () => {
  it("signs in with valid credentials and sets an HttpOnly session cookie", async () => {
    const response = await signIn(school.admin.email, TEST_PASSWORD, "203.0.113.1");
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("session_token");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const body = await response.text();
    expect(body).not.toContain("password");
    expect(await prisma.session.count({ where: { userId: school.admin.userId } })).toBe(1);
  });

  it("rejects a wrong password with a generic error", async () => {
    const response = await signIn(school.admin.email, "WrongPass999", "203.0.113.2");
    expect(response.status).toBe(401);
  });

  it("rejects unknown emails with the same status as a wrong password", async () => {
    const response = await signIn("nobody@school.test", TEST_PASSWORD, "203.0.113.3");
    expect(response.status).toBe(401);
  });

  it("does not allow public sign-up", async () => {
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "203.0.113.4" },
        body: JSON.stringify({ email: "intruder@school.test", password: "Intruder123", name: "Intruder" }),
      }),
    );
    expect(response.ok).toBe(false);
    expect(await prisma.user.count({ where: { email: "intruder@school.test" } })).toBe(0);
  });

  it("blocks deactivated accounts even with the correct password", async () => {
    const student = await createStudentActor(school.admin, school.sectionA.id);
    await setUserActive(school.admin, student.userId, false);
    const response = await signIn(student.email, TEST_PASSWORD, "203.0.113.5");
    expect(response.status).toBe(401);
    expect(await prisma.session.count({ where: { userId: student.userId } })).toBe(0);

    await setTeacherStatus(school.admin, school.teacher.teacherId!, TeacherStatus.INACTIVE);
    expect((await signIn(school.teacher.email, TEST_PASSWORD, "203.0.113.6")).status).toBe(401);
    await setTeacherStatus(school.admin, school.teacher.teacherId!, TeacherStatus.ACTIVE);
    expect((await signIn(school.teacher.email, TEST_PASSWORD, "203.0.113.6")).status).toBe(200);
  });

  it("rejects cross-origin sign-in requests (CSRF protection)", async () => {
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "x-forwarded-for": "203.0.113.7",
          cookie: "x=1",
        },
        body: JSON.stringify({ email: school.admin.email, password: TEST_PASSWORD }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rate limits repeated sign-in attempts from one IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++)
      statuses.push((await signIn(school.admin.email, "WrongPass999", "198.51.100.9")).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("account administration", () => {
  it("prevents an administrator from deactivating their own account", async () => {
    await expectAppError(setUserActive(school.admin, school.admin.userId, false), "VALIDATION");
  });
});
