import { callConnectorWebhook } from "./http";
import type { PlatformConnector } from "./types";
import { getOptionalWebhookUrl } from "../../runtime-config";

const endpoint = getOptionalWebhookUrl("YOUTUBE_LIVE_WEBHOOK_URL");

export const youtubeConnector: PlatformConnector = {
  platform: "youtube",
  prepareLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "prepare",
        session,
        destination,
      },
      "YouTube prepare simulated (no webhook configured)",
      {
        phase: "prepareLive",
        session,
        destination,
      }
    ),
  startLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "start",
        session,
        destination,
      },
      "YouTube start simulated (no webhook configured)",
      {
        phase: "startLive",
        session,
        destination,
      }
    ),
  stopLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "stop",
        session,
        destination,
      },
      "YouTube stop simulated (no webhook configured)",
      {
        phase: "stopLive",
        session,
        destination,
      }
    ),
};
