import { createHmac } from "node:crypto";
import type { ConnectorResult, StreamDestinationRecord, StreamSessionRecord } from "./types";

export function assertSimulatedConnectorsAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ALLOW_SIMULATED_CONNECTORS !== "true") {
    return;
  }

  const deploymentEnv = env.AWS_BRANCH ?? env.AMPLIFY_ENV;
  if (deploymentEnv && deploymentEnv !== "sandbox" && deploymentEnv !== "dev") {
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

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

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

function signWebhookBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
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
  return error instanceof TypeError || isAbortError(error);
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

  const secret = getRequiredEnv("CONNECTOR_WEBHOOK_SECRET");
  const { body } = buildWebhookBody(payload as Record<string, unknown>, context);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    const timestamp = new Date().toISOString();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Signature": signWebhookBody(body, secret),
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
      } catch {
        responseBody = undefined;
      }

      const parsed = responseBody as { liveUrl?: string; message?: string } | undefined;

      return {
        success: true,
        message: parsed?.message ?? "Webhook call succeeded",
        liveUrl: parsed?.liveUrl,
      };
    } catch (error) {
      const retryable = isRetryableNetworkError(error);
      if (retryable && attempt < RETRY_BACKOFF_MS.length) {
        await sleep(RETRY_BACKOFF_MS[attempt]);
        continue;
      }

      return {
        success: false,
        message: `Webhook call failed: ${isAbortError(error) ? "WEBHOOK_TIMEOUT" : getErrorMessage(error)}`,
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
