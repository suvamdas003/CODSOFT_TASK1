import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { resetDatabase } from "./fixtures";

/** Runs the real CLI (scripts/create-admin.ts) against the test database with piped input. */
function createAdmin(args: string[], password: string) {
  const result = spawnSync("npx", ["tsx", "scripts/create-admin.ts", ...args], {
    input: `${password}\n`,
    env: process.env, // DATABASE_URL already points at TEST_DATABASE_URL (setup-env.ts)
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

beforeAll(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("first administrator bootstrap (scripts/create-admin.ts)", () => {
  it("validates input and creates nothing when the password is weak", async () => {
    const run = createAdmin(["--email", "head@school.test", "--name", "Principal"], "short");
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/password/i);
    expect(await prisma.user.count()).toBe(0);
  });

  it("creates one audited administrator with a hashed password, then refuses to run again", async () => {
    const run = createAdmin(["--email", "Head@School.test", "--name", "Principal"], "Firstadmin123");
    expect(run.status, run.output).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "head@school.test" },
      include: { accounts: true },
    });
    expect(user.role).toBe(Role.ADMIN);
    expect(user.isActive).toBe(true);
    expect(user.accounts[0]?.password).toBeTruthy();
    expect(user.accounts[0]?.password).not.toContain("Firstadmin123");
    expect(await prisma.auditLog.count({ where: { entityId: user.id, action: "user.created" } })).toBe(1);

    const again = createAdmin(["--email", "other@school.test", "--name", "Deputy"], "Secondadmin123");
    expect(again.status).toBe(1);
    expect(again.output).toContain("already exists");
    expect(await prisma.user.count({ where: { role: Role.ADMIN } })).toBe(1);
  });
});
