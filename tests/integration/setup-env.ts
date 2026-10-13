import { testDatabaseUrl } from "./test-database";

// Runs before each test file is imported, so the shared Prisma client in src/server/db.ts
// connects to the disposable test database, never the development database.
const url = testDatabaseUrl();
process.env.DATABASE_URL_APP ??= process.env.DATABASE_URL;
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-not-for-real-use-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
