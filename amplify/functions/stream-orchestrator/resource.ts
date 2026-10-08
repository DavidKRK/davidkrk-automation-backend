import { defineFunction, secret } from "@aws-amplify/backend";

export const streamOrchestrator = defineFunction({
  name: "stream-orchestrator",
  entry: "./handler.ts",
  schedule: "every 5m",
  timeoutSeconds: 60,
  environment: {
    CONNECTOR_WEBHOOK_SECRET: secret("CONNECTOR_WEBHOOK_SECRET"),
  },
});
