import { defineFunction } from "@aws-amplify/backend";

export const syncSocial = defineFunction({
  name: "sync-social",
  entry: "./handler.ts",
  schedule: "every 1h",
  timeoutSeconds: 60,
});
