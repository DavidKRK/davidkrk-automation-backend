import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findMatchingAuditException,
  getUnexceptedVulnerabilities,
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

  it("tracks current high/critical advisories for direct Amplify exceptions", () => {
    const expectedAdvisories = {
      "@aws-amplify/backend-auth": ["1243066"],
      "@aws-amplify/backend-cli": ["1241230", "1242879", "1243066"],
      "@aws-amplify/backend-data": ["1241230", "1242879", "1243066"],
      "@aws-amplify/backend-function": ["1243066"],
      "@aws-amplify/backend-storage": ["1243066"],
      "@aws-amplify/data-construct": ["1243066"],
      "@aws-amplify/graphql-api-construct": ["1243066"],
    };

    expect(
      Object.fromEntries(
        config.exceptions.map((exception) => [exception.package, exception.advisories])
      )
    ).toEqual(expectedAdvisories);
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

  it("matches an exception only when package, installed path, and advisories all match", () => {
    const vulnerabilities = {
      "@aws-amplify/backend-auth": {
        nodes: ["node_modules/@aws-amplify/backend-auth"],
        via: ["dependency"],
        severity: "high",
      },
      dependency: {
        via: [{ source: 1243066, severity: "high" }],
      },
    };
    const exceptions = config.exceptions;

    expect(
      findMatchingAuditException(
        exceptions,
        "@aws-amplify/backend-auth",
        vulnerabilities["@aws-amplify/backend-auth"],
        vulnerabilities
      )?.id
    ).toBe("amplify-backend-auth-direct-high-temporary");
    expect(
      findMatchingAuditException(
        exceptions,
        "@aws-amplify/backend",
        vulnerabilities["@aws-amplify/backend-auth"],
        vulnerabilities
      )
    ).toBeUndefined();
    expect(
      findMatchingAuditException(
        exceptions,
        "@aws-amplify/backend-auth",
        {
          ...vulnerabilities["@aws-amplify/backend-auth"],
          nodes: ["node_modules/another-package"],
        },
        vulnerabilities
      )
    ).toBeUndefined();
  });

  it("does not match an exception when severity differs", () => {
    const vulnerabilities = {
      "@aws-amplify/backend-auth": {
        nodes: ["node_modules/@aws-amplify/backend-auth"],
        via: ["dependency"],
        severity: "critical",
      },
      dependency: { via: [{ source: 1243066, severity: "high" }] },
    };

    expect(
      findMatchingAuditException(
        config.exceptions,
        "@aws-amplify/backend-auth",
        vulnerabilities["@aws-amplify/backend-auth"],
        vulnerabilities
      )
    ).toBeUndefined();
  });

  it("counts only unmatched or expired findings of the target severity", () => {
    const vulnerabilities = {
      "@aws-amplify/backend": {
        nodes: ["node_modules/@aws-amplify/backend"],
        via: ["dependency"],
        severity: "high",
        isDirect: true,
      },
      "other-high-package": {
        nodes: ["node_modules/other-high-package"],
        via: [{ source: 200, severity: "high" }],
        severity: "high",
        isDirect: true,
      },
      "transitive-high-package": {
        nodes: ["node_modules/transitive-high-package"],
        via: [{ source: 202, severity: "high" }],
        severity: "high",
        isDirect: false,
      },
      "moderate-package": {
        nodes: ["node_modules/moderate-package"],
        via: [{ source: 201, severity: "moderate" }],
        severity: "moderate",
        isDirect: true,
      },
      dependency: {
        via: [
          { source: 1241230, severity: "high" },
          { source: 1242879, severity: "high" },
          { source: 1243066, severity: "high" },
        ],
      },
    };

    expect(
      getUnexceptedVulnerabilities(vulnerabilities, config.exceptions, "high", "2026-11-14")
        .map(([name]) => name)
    ).toEqual(["@aws-amplify/backend", "other-high-package"]);
    expect(
      getUnexceptedVulnerabilities(vulnerabilities, config.exceptions, "high", "2026-12-01")
        .map(([name]) => name)
    ).toEqual(["@aws-amplify/backend", "other-high-package"]);
    expect(
      getUnexceptedVulnerabilities(
        vulnerabilities,
        config.exceptions,
        "high",
        "2026-11-14",
        ["@aws-amplify/backend"]
      ).map(([name]) => name)
    ).toEqual(["@aws-amplify/backend"]);
  });
});
