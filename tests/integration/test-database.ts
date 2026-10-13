import "dotenv/config";

/**
 * Resolve the integration-test database URL and refuse anything that could be a real
 * database: it must be set explicitly, differ from DATABASE_URL, and name a database
 * containing "test". The suite truncates every table in it.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. Add a disposable test database to .env (see .env.example).");
  // DATABASE_URL_APP preserves the development URL after setup-env.ts swaps DATABASE_URL.
  const appUrl = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (url === appUrl) {
    throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL.");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run integration tests against "${dbName}": the test database name must contain "test".`,
    );
  }
  return url;
}
