/**
 * Create the FIRST administrator of a real deployment (no demo data involved).
 *
 *   npx tsx scripts/create-admin.ts --email admin@school.example --name "Ada Admin"
 *   (or: npm run admin:create -- --email ... --name ...)
 *
 * The password is read from the terminal without echo, or from the first line of stdin
 * when input is piped. Refuses to run when an administrator already exists: every further
 * account is created by an administrator on the Users page, where changes are audited.
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { Role } from "../src/generated/prisma/enums";
import { isAppError, parseInput } from "../src/lib/errors";
import { createAdminSchema } from "../src/lib/validation/users";
import { prisma } from "../src/server/db";
import { recordAudit } from "../src/server/services/audit.service";
import { assertEmailAvailable, createLoginUser } from "../src/server/services/user.service";

const ADMIN_EXISTS = "An administrator already exists. Sign in and create further accounts on the Users page.";

async function readPipedLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Echo nothing while the password is typed.
    (rl as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => {};
    process.stdout.write(prompt);
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) return readPipedLine();
  const password = await readHidden("Password for the new administrator: ");
  if ((await readHidden("Repeat the password: ")) !== password) throw new Error("The passwords do not match.");
  return password;
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
  if (!values.email || !values.name) {
    throw new Error('Usage: npx tsx scripts/create-admin.ts --email admin@school.example --name "Full Name"');
  }
  if ((await prisma.user.count({ where: { role: Role.ADMIN } })) > 0) throw new Error(ADMIN_EXISTS);

  const data = parseInput(createAdminSchema, {
    email: values.email,
    name: values.name,
    password: await readPassword(),
  });
  const passwordHash = await hashPassword(data.password);
  await prisma.$transaction(async (tx) => {
    if ((await tx.user.count({ where: { role: Role.ADMIN } })) > 0) throw new Error(ADMIN_EXISTS);
    await assertEmailAvailable(tx, data.email);
    const userId = await createLoginUser(tx, { name: data.name, email: data.email, role: Role.ADMIN, passwordHash });
    await recordAudit(tx, null, {
      action: "user.created",
      entityType: "User",
      entityId: userId,
      summary: `Created initial administrator account ${data.email} (create-admin script)`,
    });
  });
  console.log(`Administrator ${data.email} created. Sign in at ${process.env.BETTER_AUTH_URL ?? "the app URL"}.`);
}

main()
  .catch((error) => {
    console.error(isAppError(error) || error instanceof Error ? error.message : error);
    if (isAppError(error)) {
      for (const [field, messages] of Object.entries(error.fieldErrors ?? {})) {
        console.error(`  ${field}: ${messages?.join(" ")}`);
      }
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
