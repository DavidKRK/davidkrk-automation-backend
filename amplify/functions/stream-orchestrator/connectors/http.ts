import type { ConnectorResult } from "./types";

export async function callConnectorWebhook(
  endpoint: string | undefined,
  payload: unknown,
  fallbackMessage: string
): Promise<ConnectorResult> {
  if (!endpoint) {
    return {
      success: true,
      message: fallbackMessage,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return {
      success: false,
      message: `Webhook call failed: HTTP ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  const parsed = body as { liveUrl?: string; message?: string } | undefined;

  return {
    success: true,
    message: parsed?.message ?? "Webhook call succeeded",
    liveUrl: parsed?.liveUrl,
  };
}
