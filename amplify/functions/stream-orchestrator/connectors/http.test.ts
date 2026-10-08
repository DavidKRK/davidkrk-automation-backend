import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  assertSimulatedConnectorsAllowed,
  callConnectorWebhook,
  isWebhookTimestampFresh,
  verifyWebhookSignature,
} from "./http";

const defaultContext = {
  phase: "prepareLive" as const,
  session: { id: "session-1" },
  destination: { id: "dest-1" },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.CONNECTOR_WEBHOOK_SECRET = "super-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.CONNECTOR_WEBHOOK_SECRET;
});

test("assertSimulatedConnectorsAllowed rejects simulated connectors outside sandbox or dev", () => {
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
      AWS_BRANCH: "main",
    } as NodeJS.ProcessEnv)
  ).toThrow(/sandbox or dev deployments/);
});

test("assertSimulatedConnectorsAllowed rejects simulation without deployment metadata", () => {
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
    } as NodeJS.ProcessEnv)
  ).toThrow(/AWS_BRANCH or AMPLIFY_ENV/);
});

test("assertSimulatedConnectorsAllowed allows simulation in sandbox", () => {
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
      AWS_BRANCH: "sandbox",
    } as NodeJS.ProcessEnv)
  ).not.toThrow();
});

test("callConnectorWebhook signs payloads and adds an idempotency key", async () => {
  const fetchMock = vi.mocked(global.fetch);
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ message: "ok", liveUrl: "https://live.example" }),
  } as Response);

  const payload = {
    action: "prepare",
    session: defaultContext.session,
    destination: defaultContext.destination,
  };

  const result = await callConnectorWebhook(
    "https://example.test/webhook",
    payload,
    "fallback",
    defaultContext
  );

  expect(result).toEqual({
    success: true,
    message: "ok",
    liveUrl: "https://live.example",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const body = init.body as string;
  const headers = init.headers as Record<string, string>;

  expect(url).toBe("https://example.test/webhook");
  expect(body).toBe(
    JSON.stringify({
      ...payload,
      idempotencyKey: "session-1:dest-1:prepareLive",
    })
  );
  expect(headers["content-type"]).toBe("application/json");
  expect(headers["X-Timestamp"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(headers["X-Signature"]).toBe(
    `sha256=${createHmac("sha256", "super-secret").update(body).digest("hex")}`
  );
  expect(headers["X-Signature-Timestamped"]).toBe(
    `sha256=${createHmac("sha256", "super-secret")
      .update(`${headers["X-Timestamp"]}.${body}`)
      .digest("hex")}`
  );
  expect(
    verifyWebhookSignature(
      body,
      headers["X-Timestamp"],
      "super-secret",
      headers["X-Signature-Timestamped"]
    )
  ).toBe(true);
});

test("verifyWebhookSignature rejects stale timestamps", () => {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const body = JSON.stringify({ hello: "world" });
  const signature = `sha256=${createHmac("sha256", "super-secret")
    .update(`${timestamp}.${body}`)
    .digest("hex")}`;

  expect(isWebhookTimestampFresh(timestamp, Date.parse("2026-01-01T00:06:00.000Z"))).toBe(false);
  expect(
    verifyWebhookSignature(
      body,
      timestamp,
      "super-secret",
      signature,
      Date.parse("2026-01-01T00:06:00.000Z")
    )
  ).toBe(false);
});

test("callConnectorWebhook retries on 5xx responses", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.mocked(global.fetch);
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 502,
  } as Response);
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ message: "retried" }),
  } as Response);

  const promise = callConnectorWebhook(
    "https://example.test/webhook",
    {
      action: "start",
      session: defaultContext.session,
      destination: defaultContext.destination,
    },
    "fallback",
    {
      phase: "startLive",
      session: defaultContext.session,
      destination: defaultContext.destination,
    }
  );

  await vi.advanceTimersByTimeAsync(1000);
  await expect(promise).resolves.toEqual({
    success: true,
    message: "retried",
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test("callConnectorWebhook returns WEBHOOK_TIMEOUT without retrying on timeout", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.mocked(global.fetch);
  fetchMock.mockImplementation((_, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        },
        { once: true }
      );
    })
  );

  const promise = callConnectorWebhook(
    "https://example.test/webhook",
    {
      action: "stop",
      session: defaultContext.session,
      destination: defaultContext.destination,
    },
    "fallback",
    {
      phase: "stopLive",
      session: defaultContext.session,
      destination: defaultContext.destination,
    }
  );

  await vi.advanceTimersByTimeAsync(10_000);
  await expect(promise).resolves.toEqual({
    success: false,
    message: "Webhook call failed: WEBHOOK_TIMEOUT",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
