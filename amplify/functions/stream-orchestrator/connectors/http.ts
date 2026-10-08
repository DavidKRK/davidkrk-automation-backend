import { createHmac, timingSafeEqual } from "node:crypto";
import { requireConnectorWebhookSecret, validateHttpUrl } from "../../runtime-config";
import type { ConnectorResult, StreamDestinationRecord, StreamSessionRecord } from "./types";

export function assertSimulatedConnectorsAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ALLOW_SIMULATED_CONNECTORS !== "true") {
    return;
  }

  const deploymentNames = [
    env.CONNECTOR_DEPLOYMENT_BRANCH ?? env.AWS_BRANCH,
    env.CONNECTOR_AMPLIFY_ENV ?? env.AMPLIFY_ENV,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());
  if (deploymentNames.length === 0) {
    throw new Error(
      "ALLOW_SIMULATED_CONNECTORS=true requires deployment metadata identifying a sandbox or dev deployment."
    );
  }

  if (deploymentNames.some((name) => !["sandbox", "dev", "development"].includes(name))) {
    throw new Error(
      "ALLOW_SIMULATED_CONNECTORS=true is only allowed for sandbox or dev deployments."
    );
  }
}

export type ConnectorPhase = "prepareLive" | "startLive" | "stopLive";

export interface ConnectorWebhookContext {
  phase: ConnectorPhase;
  session: Pick<StreamSessionRecord, "id">;
  destination: Pick<StreamDestinationRecord, "id">;
}

const WEBHOOK_TIMEOUT_MS = 10_000;
const RETRY_BACKOFF_MS = [1_000, 4_000];
const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60_000;

function buildWebhookBody(payload: Record<string, unknown>, context: ConnectorWebhookContext): {
  body: string;
  idempotencyKey: string;
} {
  const idempotencyKey = `${context.session.id}:${context.destination.id}:${context.phase}`;
  return {
    body: JSON.stringify({
      ...payload,
      idempotencyKey,
    }),
    idempotencyKey,
  };
}

export function isWebhookTimestampFresh(
  timestamp: string,
  nowMs = Date.now(),
  maxAgeMs = WEBHOOK_REPLAY_WINDOW_MS
): boolean {
  const timestampMs = Date.parse(timestamp);

  if (Number.isNaN(timestampMs)) {
    return false;
  }

  return nowMs - timestampMs <= maxAgeMs && timestampMs - nowMs <= maxAgeMs;
}

function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function signWebhookBodyWithTimestamp(body: string, timestamp: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyWebhookSignature(
  body: string,
  timestamp: string,
  secret: string,
  signature: string,
  nowMs = Date.now()
): boolean {
  if (!isWebhookTimestampFresh(timestamp, nowMs)) {
    return false;
  }

  const expectedSignature = signWebhookBodyWithTimestamp(body, timestamp, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

function isRetryableNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown network error";
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export async function callConnectorWebhook(
  endpoint: string | undefined,
  payload: Record<string, unknown>,
  fallbackMessage: string,
  context: ConnectorWebhookContext
): Promise<ConnectorResult> {
  assertSimulatedConnectorsAllowed();

  if (!endpoint) {
    if (process.env.ALLOW_SIMULATED_CONNECTORS === "true") {
      return {
        success: true,
        message: fallbackMessage,
      };
    }

    return {
      success: false,
      message:
        "Missing connector webhook URL. Set platform webhook URL or ALLOW_SIMULATED_CONNECTORS=true.",
    };
  }

  const validatedEndpoint = validateHttpUrl(endpoint);
  const secret = requireConnectorWebhookSecret("CONNECTOR_WEBHOOK_SECRET");
  const { body } = buildWebhookBody(payload as Record<string, unknown>, context);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    const timestamp = new Date().toISOString();

    try {
      const signature = signWebhookBody(body, secret);
      const timestampedSignature = signWebhookBodyWithTimestamp(body, timestamp, secret);
      const response = await fetch(validatedEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Signature": signature,
          "X-Signature-Timestamped": timestampedSignature,
          "X-Timestamp": timestamp,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < RETRY_BACKOFF_MS.length) {
          await sleep(RETRY_BACKOFF_MS[attempt]);
          continue;
        }

        return {
          success: false,
          message: `Webhook call failed: HTTP ${response.status}`,
        };
      }

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        responseBody = undefined;
      }

      const parsed = responseBody as { liveUrl?: string; message?: string } | undefined;

      return {
        success: true,
        message: parsed?.message ?? "Webhook call succeeded",
        liveUrl: parsed?.liveUrl,
      };
    } catch (error) {
      if (isAbortError(error)) {
        return {
          success: false,
          message: "Webhook call failed: WEBHOOK_TIMEOUT",
        };
      }

      const retryable = isRetryableNetworkError(error);
      if (retryable && attempt < RETRY_BACKOFF_MS.length) {
        await sleep(RETRY_BACKOFF_MS[attempt]);
        continue;
      }

      return {
        success: false,
        message: `Webhook call failed: ${getErrorMessage(error)}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    success: false,
    message: "Webhook call failed: Unknown error",
  };
}
