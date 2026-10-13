import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

/** Apply migrations to the test database once before the integration suite. */
export default function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
