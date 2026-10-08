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
  return (
    PLACEHOLDER_VALUES.has(normalized) ||
    /^<[^<>]+>$/.test(normalized) ||
    /^\$\{[^{}]+\}$/.test(normalized) ||
    /^\{\{[^{}]+\}\}$/.test(normalized)
  );
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

export function requireConnectorWebhookSecret(name: string): string {
  const value = requireSecret(name);
  const decoded = Buffer.from(value, "base64");

  if (
    value.length !== 44 ||
    decoded.length !== 32 ||
    decoded.toString("base64") !== value ||
    decoded.every((byte) => byte === decoded[0])
  ) {
    throw new Error(`Secret ${name} must be a canonical Base64 encoding of 32 bytes.`);
  }

  return value;
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  const deploymentNames = [
    env.CONNECTOR_DEPLOYMENT_BRANCH ?? env.AWS_BRANCH,
    env.CONNECTOR_AMPLIFY_ENV ?? env.AMPLIFY_ENV,
  ]
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

function isPlaceholderWebhookHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "example.com" ||
    normalized === "example.net" ||
    normalized === "example.org" ||
    normalized.endsWith(".example.com") ||
    normalized.endsWith(".example.net") ||
    normalized.endsWith(".example.org") ||
    normalized === "example" ||
    normalized.endsWith(".example")
  );
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
      isPlaceholderWebhookHostname(url.hostname) ||
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

  try {
    return validateHttpUrl(value, env);
  } catch {
    throw new Error(`Environment variable ${name} contains an invalid webhook URL or placeholder.`);
  }
}
