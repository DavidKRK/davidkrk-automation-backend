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

  if (value.length < 12) {
    throw new Error(`Secret ${name} is too short to be trusted.`);
  }

  return value;
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  const deploymentNames = [env.AWS_BRANCH, env.AMPLIFY_ENV]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());

  if (
    env.NODE_ENV === "production" ||
    deploymentNames.some((name) => ["main", "prod", "production"].includes(name))
  ) {
    return true;
  }

  return !deploymentNames.some((name) => ["sandbox", "dev", "development"].includes(name));
}

export function validateHttpUrl(
  value: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      (isProduction(env) && url.protocol !== "https:")
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(
      `Environment variable webhook URL must be a valid ${isProduction(env) ? "HTTPS" : "HTTP or HTTPS"} URL.`
    );
  }
}

export function getOptionalWebhookUrl(
  name: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const value = env[name]?.trim();
  if (!value) return undefined;

  if (isLikelyPlaceholder(value)) {
    throw new Error(`Environment variable ${name} contains a placeholder or invalid value.`);
  }

  try {
    return validateHttpUrl(value, env);
  } catch {
    throw new Error(`Environment variable ${name} contains an invalid webhook URL.`);
  }
}
