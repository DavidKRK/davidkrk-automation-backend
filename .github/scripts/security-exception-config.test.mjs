import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateExceptionConfig } from "./security-exception-config.mjs";

const config = JSON.parse(
  readFileSync(new URL("../security/audit-exceptions.json", import.meta.url), "utf8")
);

describe("temporary audit exception configuration", () => {
  it("requires an owner, expiry, justification, and explicit removal plan for every exception", () => {
    expect(() => validateExceptionConfig(config, { requireUpstreamPackage: true })).not.toThrow();
    expect(
      config.exceptions.every(
        (exception) =>
          exception.owner &&
          exception.expiresOn &&
          exception.reason &&
          exception.removalPlan
      )
    ).toBe(true);
  });

  it("rejects exceptions without a removal plan", () => {
    const invalidConfig = {
      exceptions: [{ ...config.exceptions[0], removalPlan: "" }],
    };

    expect(() => validateExceptionConfig(invalidConfig)).toThrow(/removalPlan/);
  });
});
