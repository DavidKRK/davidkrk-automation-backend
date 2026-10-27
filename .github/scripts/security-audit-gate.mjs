import fs from "node:fs";
import {
  getHighSeverityAdvisoryIds,
  hasExactAdvisories,
  validateExceptionConfig,
} from "./security-exception-config.mjs";

const auditPath = process.argv[2] ?? "audit.json";
const exceptionsPath = process.argv[3] ?? ".github/security/audit-exceptions.json";

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const exceptionConfig = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
let exceptions;

try {
  exceptions = validateExceptionConfig(exceptionConfig);
} catch (error) {
  console.error(`Configuration d'exceptions invalide:\n${error.message}`);
  process.exit(1);
}

// npm peut renvoyer un objet d'erreur JSON au lieu d'un rapport exploitable.
// Ne jamais interpréter l'absence de findings comme un audit réussi.
if (
  !audit ||
  typeof audit !== "object" ||
  Array.isArray(audit) ||
  audit.error ||
  !audit.vulnerabilities ||
  typeof audit.vulnerabilities !== "object" ||
  Array.isArray(audit.vulnerabilities)
) {
  console.error("Rapport npm audit invalide ou en erreur: policy non évaluée.");
  process.exit(1);
}

const vulnerabilities = Object.entries(audit.vulnerabilities);
if (vulnerabilities.some(([, vulnerability]) =>
  !vulnerability ||
  typeof vulnerability !== "object" ||
  Array.isArray(vulnerability) ||
  !["info", "low", "moderate", "high", "critical"].includes(vulnerability.severity) ||
  typeof vulnerability.isDirect !== "boolean" ||
  !Array.isArray(vulnerability.via) ||
  !Array.isArray(vulnerability.nodes)
)) {
  console.error("Rapport npm audit invalide: structure de vulnérabilité inattendue.");
  process.exit(1);
}

const blockers = [];
const allowedExceptions = [];
const transitiveWarnings = [];

const today = new Date().toISOString().slice(0, 10);

for (const [name, vuln] of vulnerabilities) {
  if (!["high", "critical"].includes(vuln.severity)) {
    continue;
  }

  const advisoryIds = getHighSeverityAdvisoryIds(vuln, audit.vulnerabilities);
  const configuredExceptions = exceptions.filter((exception) => exception.package === name);

  const match = configuredExceptions.find((exception) => {
    if (exception.severity !== vuln.severity) {
      return false;
    }

    const nodes = vuln.nodes ?? [];
    if (!nodes.some((node) => node.includes(exception.nodePathContains))) {
      return false;
    }

    if (!hasExactAdvisories(exception.advisories, advisoryIds)) {
      return false;
    }

    if (!exception.effectContains) {
      return true;
    }

    const effects = vuln.effects ?? [];
    return effects.some((effect) => effect.includes(exception.effectContains));
  });

  if (!match) {
    if (vuln.isDirect) {
      const observed = advisoryIds.join(", ") || "aucun identifiant exploitable";
      const configured = configuredExceptions.length === 0
        ? "aucune exception configurée"
        : configuredExceptions.map((exception) =>
            `${exception.id}: advisories=[${[...exception.advisories].sort().join(", ")}], severity=${exception.severity}, expiresOn=${exception.expiresOn}`
          ).join("; ");
      blockers.push(
        `${name}: vulnérabilité ${vuln.severity} directe; observés=[${observed}]; configuration: ${configured}; aucune exception exacte applicable`
      );
      continue;
    }
    transitiveWarnings.push(`${name}: vulnérabilité ${vuln.severity} transitive (non bloquante)`);
    continue;
  }

  if (today > match.expiresOn) {
    blockers.push(
      `${name}: exception expirée le ${match.expiresOn} (${match.id})`
    );
    continue;
  }

  allowedExceptions.push(`${name}: exception ${match.id} valide jusqu'au ${match.expiresOn}`);
}

console.log("Résumé audit sécurité:");
console.log(`- Exceptions actives: ${allowedExceptions.length}`);
console.log(`- Vulnérabilités transitives non bloquantes: ${transitiveWarnings.length}`);
console.log(`- Bloquantes: ${blockers.length}`);

if (allowedExceptions.length > 0) {
  console.log("Exceptions appliquées:");
  for (const line of allowedExceptions) {
    console.log(`  - ${line}`);
  }
}

if (transitiveWarnings.length > 0) {
  console.log("Transitifs à surveiller:");
  for (const line of transitiveWarnings) {
    console.log(`  - ${line}`);
  }
}

if (blockers.length > 0) {
  console.error("Échec policy sécurité CI:");
  for (const line of blockers) {
    console.error(`  - ${line}`);
  }
  process.exit(1);
}

console.log("Policy sécurité CI: OK");
