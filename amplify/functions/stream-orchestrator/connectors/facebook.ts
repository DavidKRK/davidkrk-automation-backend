import { callConnectorWebhook } from "./http";
import type { PlatformConnector } from "./types";
import { getOptionalWebhookUrl } from "../../runtime-config";

const endpoint = getOptionalWebhookUrl("FACEBOOK_LIVE_WEBHOOK_URL");

export const facebookConnector: PlatformConnector = {
  platform: "facebook",
  prepareLive: async (session, destination) =>
    callConnectorWebhook(
      endpoint,
      {
        action: "prepare",
        session,
        destination,
      },
      "Facebook prepare simulated (no webhook configured)",
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
      "Facebook start simulated (no webhook configured)",
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
      "Facebook stop simulated (no webhook configured)",
      {
        phase: "stopLive",
        session,
        destination,
      }
    ),
};
