import { beforeEach, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.YOUTUBE_LIVE_WEBHOOK_URL = "https://example.test/webhook";
});

const callConnectorWebhookMock = vi.hoisted(() => vi.fn());

vi.mock("./http", () => ({
  callConnectorWebhook: callConnectorWebhookMock,
}));

import { youtubeConnector } from "./youtube";

beforeEach(() => {
  callConnectorWebhookMock.mockReset();
});

test("youtube connector builds the prepare payload with session and destination", async () => {
  callConnectorWebhookMock.mockResolvedValueOnce({
    success: true,
    message: "ok",
  });

  const session = { id: "session-1", title: "Live", status: "pending" } as any;
  const destination = { id: "dest-1", platform: "youtube", name: "YT" } as any;

  await youtubeConnector.prepareLive(session, destination);

  expect(callConnectorWebhookMock).toHaveBeenCalledWith(
    "https://example.test/webhook",
    {
      action: "prepare",
      session,
      destination,
    },
    "YouTube prepare simulated (no webhook configured)"
  );
});
