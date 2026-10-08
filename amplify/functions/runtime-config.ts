const PLACEHOLDER_VALUES = new Set([
  "",
  "changeme",
  "change-me",
  "replace-me",
  "example",
  "example.com",
  "example-domain",
  "insert-value",
  "todo",
  "tbd",
  "your-api-key",
  "your-channel-id",
  "your-secret",
  "your-token",
  "placeholder",
  "mock",
  "test",
  "lorem",
  "ipsum",
  "undefined",
  "null",
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function isLikelyPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = normalize(value);
  if (normalized.length === 0) return true;
  if (PLACEHOLDER_VALUES.has(normalized)) return true;
  if (normalized.includes("replace") && normalized.includes("me")) return true;
  if (normalized.includes("example") || normalized.includes("sample")) return true;
  if (normalized.includes("changeme") || normalized.includes("your_")) return true;
  return false;
}

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (isLikelyPlaceholder(value)) {
    throw new Error(`Environment variable ${name} contains a placeholder or invalid value.`);
  }

  return value;
}

export function requireSecret(name: string): string {
  const value = getRequiredEnv(name);
  const minimumLength = process.env.NODE_ENV === "test" ? 1 : 12;

  if (value.length < minimumLength) {
    throw new Error(`Secret ${name} is too short to be trusted.`);
  }

  return value;
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
