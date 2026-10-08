import { expect, test } from "vitest";
import { assertSimulatedConnectorsAllowed } from "./http";

test("assertSimulatedConnectorsAllowed rejects simulated connectors outside sandbox or dev", () => {
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
      AWS_BRANCH: "main",
    } as NodeJS.ProcessEnv)
  ).toThrow(/sandbox or dev deployments/);
});

test("assertSimulatedConnectorsAllowed allows simulation in sandbox", () => {
  expect(() =>
    assertSimulatedConnectorsAllowed({
      ALLOW_SIMULATED_CONNECTORS: "true",
      AWS_BRANCH: "sandbox",
    } as NodeJS.ProcessEnv)
  ).not.toThrow();
});
