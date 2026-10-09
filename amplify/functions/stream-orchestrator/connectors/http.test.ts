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
  process.env.CONNECTOR_WEBHOOK_SECRET = Buffer.from(
    "0123456789abcdef0123456789abcdef"
  ).toString("base64");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
  ).toThrow(/deployment metadata/);
});

test("assertSimulatedConnectorsAllowed allows simulation in sandbox", () => {
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
      AWS_BRANCH: "sandbox",
    } as NodeJS.ProcessEnv)
  ).not.toThrow();
});

test("assertSimulatedConnectorsAllowed uses synthesized deployment metadata", () => {
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
      CONNECTOR_DEPLOYMENT_BRANCH: "main",
    } as NodeJS.ProcessEnv)
  ).toThrow(/sandbox or dev deployments/);
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
      CONNECTOR_DEPLOYMENT_BRANCH: "sandbox",
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
    `sha256=${createHmac("sha256", process.env.CONNECTOR_WEBHOOK_SECRET!).update(body).digest("hex")}`
  );
  expect(headers["X-Signature-Timestamped"]).toBe(
    `sha256=${createHmac("sha256", process.env.CONNECTOR_WEBHOOK_SECRET!)
      .update(`${headers["X-Timestamp"]}.${body}`)
      .digest("hex")}`
  );
  expect(
    verifyWebhookSignature(
      body,
      headers["X-Timestamp"],
      process.env.CONNECTOR_WEBHOOK_SECRET!,
      headers["X-Signature-Timestamped"]
    )
  ).toBe(true);
});

test("callConnectorWebhook refuses non-HTTPS endpoints in production", async () => {
  vi.stubEnv("NODE_ENV", "production");

  await expect(
    callConnectorWebhook("http://webhook.example.org/hook", {}, "fallback", defaultContext)
  ).rejects.toThrow(/HTTPS/);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("verifyWebhookSignature rejects stale timestamps", () => {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const body = JSON.stringify({ hello: "world" });
  const signature = `sha256=${createHmac("sha256", process.env.CONNECTOR_WEBHOOK_SECRET!)
    .update(`${timestamp}.${body}`)
    .digest("hex")}`;

  expect(isWebhookTimestampFresh(timestamp, Date.parse("2026-01-01T00:06:00.000Z"))).toBe(false);
  expect(
    verifyWebhookSignature(
      body,
      timestamp,
      process.env.CONNECTOR_WEBHOOK_SECRET!,
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

test("callConnectorWebhook returns WEBHOOK_TIMEOUT when response body read is aborted", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.mocked(global.fetch);
  fetchMock.mockImplementation((_, init) => {
    const signal = init?.signal;

    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              reject(Object.assign(new Error("Body read aborted"), { name: "AbortError" }));
            },
            { once: true }
          );
        }),
    } as Response);
  });

  const promise = callConnectorWebhook(
    "https://example.test/webhook",
    {
      action: "prepare",
      session: defaultContext.session,
      destination: defaultContext.destination,
    },
    "fallback",
    defaultContext
  );

  await vi.advanceTimersByTimeAsync(10_000);
  await expect(promise).resolves.toEqual({
    success: false,
    message: "Webhook call failed: WEBHOOK_TIMEOUT",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
