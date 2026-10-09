import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getHighSeverityAdvisoryIds,
  hasExactAdvisories,
  validateExceptionConfig,
} from "./security-exception-config.mjs";

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

  it("requires exact advisory identifier lists", () => {
    const invalidConfig = {
      exceptions: [{ ...config.exceptions[0], advisories: [] }],
    };

    expect(() => validateExceptionConfig(invalidConfig)).toThrow(/advisories/);
  });

  it("collects high/critical advisory IDs through the audit dependency chain", () => {
    const vulnerabilities = {
      direct: { via: ["transitive", "another"] },
      transitive: {
        via: [
          { source: 101, severity: "high" },
          { source: 102, severity: "moderate" },
        ],
      },
      another: { via: [{ source: 103, severity: "critical" }] },
    };

    expect(getHighSeverityAdvisoryIds(vulnerabilities.direct, vulnerabilities)).toEqual([
      "101",
      "103",
    ]);
    expect(hasExactAdvisories(["101", "103"], ["103", "101"])).toBe(true);
    expect(hasExactAdvisories(["101"], ["101", "104"])).toBe(false);
  });
});
