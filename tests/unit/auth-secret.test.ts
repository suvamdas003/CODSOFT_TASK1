import { describe, expect, it } from "vitest";
import { checkSecretStrength } from "@/server/auth/secret";

describe("checkSecretStrength", () => {
  it("rejects missing, template and short secrets", () => {
    expect(checkSecretStrength(undefined)).toMatch(/not set/);
    expect(checkSecretStrength("")).toMatch(/not set/);
    // Values shipped in .env.example / .env.docker.example, even when padded to length.
    expect(checkSecretStrength("replace-with-output-of-the-command-above")).toMatch(/placeholder/);
    expect(checkSecretStrength("replace-with-generated-secret")).toMatch(/placeholder/);
    expect(checkSecretStrength("replace-with-a-long-random-string-0123456789")).toMatch(/placeholder/);
    expect(checkSecretStrength("change-me-change-me-change-me-change-me")).toMatch(/placeholder/);
    expect(checkSecretStrength("too-short-secret-123")).toMatch(/at least 32/);
  });

  it("accepts a generated secret", () => {
    expect(checkSecretStrength("3bq0Hc1sQ9pV7xLwKk2mZr8tYdA5eF6gJ4nU0iO1pLs")).toBeNull();
  });
});
