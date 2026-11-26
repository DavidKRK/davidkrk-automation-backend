import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("security autofix plan", () => {
  it("plans only direct findings of the requested severity", () => {
    const directory = mkdtempSync(join(tmpdir(), "security-autofix-plan-"));
    const auditPath = join(directory, "audit.json");
    const outputPath = join(directory, "github-output");

    try {
      writeFileSync(
        auditPath,
        JSON.stringify({
          vulnerabilities: {
            "direct-fixable": { severity: "high", isDirect: true, fixAvailable: true },
            "transitive-fixable": { severity: "high", isDirect: false, fixAvailable: true },
            "direct-manual": { severity: "high", isDirect: true, fixAvailable: false },
          },
        })
      );

      execFileSync(
        process.execPath,
        [new URL("./security-autofix-plan.mjs", import.meta.url).pathname, auditPath, "high"],
        { env: { ...process.env, GITHUB_OUTPUT: outputPath } }
      );

      expect(readFileSync(outputPath, "utf8")).toContain("names=direct-fixable");
      expect(readFileSync(outputPath, "utf8")).toContain("manual=direct-manual");
      expect(readFileSync(outputPath, "utf8")).not.toContain("transitive-fixable");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
