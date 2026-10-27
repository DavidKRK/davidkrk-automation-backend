import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../security-audit-gate.mjs", import.meta.url));

function runGate(audit, exceptions = []) {
  const directory = mkdtempSync(join(tmpdir(), "audit-gate-test-"));
  try {
    const auditPath = join(directory, "audit.json");
    const exceptionsPath = join(directory, "exceptions.json");
    writeFileSync(auditPath, JSON.stringify(audit));
    writeFileSync(exceptionsPath, JSON.stringify({ exceptions }));
    const result = spawnSync(process.execPath, [script, auditPath, exceptionsPath], {
      encoding: "utf8",
    });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

// Fixtures contractuelles synthétiques, sans lien avec un audit réel.
function fixture() {
  return { vulnerabilities: {
    direct: {
      severity: "high", isDirect: true, via: ["transitive"],
      nodes: ["node_modules/direct"], effects: [],
    },
    transitive: {
      severity: "high", isDirect: false,
      via: [{ source: 101, severity: "high" }],
      nodes: ["node_modules/transitive"], effects: ["direct"],
    },
  } };
}

function exception(overrides = {}) {
  return {
    id: "test-only", package: "direct", nodePathContains: "node_modules/direct",
    advisories: ["101"], severity: "high", owner: "@test", issue: "#1",
    expiresOn: "9999-12-31", reason: "Test uniquement.",
    removalPlan: "Retirer après correction.", ...overrides,
  };
}

test("accepts a valid empty audit report", () => {
  assert.equal(runGate({ vulnerabilities: {} }).status, 0);
});

test("rejects registry error objects and missing or invalid findings", () => {
  for (const report of [null, [], {}, { vulnerabilities: [] },
    { error: { code: "EAUDIT" }, vulnerabilities: {} },
    { vulnerabilities: { bad: {} } },
  ]) {
    const result = runGate(report);
    assert.equal(result.status, 1);
    assert.match(result.output, /Rapport npm audit invalide/);
  }
});

test("blocks a direct high without an exception and shows observed IDs", () => {
  const result = runGate(fixture());
  assert.equal(result.status, 1);
  assert.match(result.output, /observés=\[101\]/);
  assert.match(result.output, /aucune exception configurée/);
});

test("accepts an exact recursive advisory match", () => {
  const result = runGate(fixture(), [exception()]);
  assert.equal(result.status, 0);
  assert.match(result.output, /Exceptions actives: 1/);
});

test("does not treat a new advisory as already accepted", () => {
  const report = fixture();
  report.vulnerabilities.transitive.via.push({ source: 102, severity: "critical" });
  const result = runGate(report, [exception()]);
  assert.equal(result.status, 1);
  assert.match(result.output, /observés=\[101, 102\]/);
  assert.match(result.output, /advisories=\[101\]/);
});

test("does not accept obsolete advisory identifiers", () => {
  assert.equal(runGate(fixture(), [exception({ advisories: ["100"] })]).status, 1);
});

test("blocks expired exceptions", () => {
  const result = runGate(fixture(), [exception({ expiresOn: "2000-01-01" })]);
  assert.equal(result.status, 1);
  assert.match(result.output, /exception expirée/);
});

test("does not reuse a high exception for a critical finding", () => {
  const report = fixture();
  report.vulnerabilities.direct.severity = "critical";
  assert.equal(runGate(report, [exception()]).status, 1);
});

test("checks package paths and optional effects", () => {
  assert.equal(runGate(fixture(), [exception({ nodePathContains: "elsewhere" })]).status, 1);
  assert.equal(runGate(fixture(), [exception({ effectContains: "absent" })]).status, 1);
});

test("handles cyclic transitive references without hiding advisories", () => {
  const report = fixture();
  report.vulnerabilities.transitive.via.push("direct");
  assert.equal(runGate(report, [exception()]).status, 0);
});

test("preserves the existing non-blocking transitive policy", () => {
  const report = fixture();
  delete report.vulnerabilities.direct;
  const result = runGate(report);
  assert.equal(result.status, 0);
  assert.match(result.output, /transitives non bloquantes: 1/);
});

test("rejects malformed exception configuration", () => {
  assert.equal(runGate(fixture(), [exception({ advisories: [] })]).status, 1);
});
