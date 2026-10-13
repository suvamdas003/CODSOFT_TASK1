/** Fragments of the placeholder values used in .env.example, .env.docker.example and the docs. */
const TEMPLATE_VALUE = /replace-with|change-?me|your[-_]?secret|placeholder/i;

export const MIN_SECRET_LENGTH = 32;

/**
 * Check a BETTER_AUTH_SECRET value. Returns what is wrong with it, or null when it is
 * acceptable. A template value or a short secret means one was never generated.
 */
export function checkSecretStrength(secret: string | undefined): string | null {
  if (!secret) return "is not set.";
  if (TEMPLATE_VALUE.test(secret)) return "still contains a placeholder value from a template.";
  if (secret.length < MIN_SECRET_LENGTH) return `must be at least ${MIN_SECRET_LENGTH} characters long.`;
  return null;
}
