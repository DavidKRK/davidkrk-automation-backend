const REQUIRED_EXCEPTION_FIELDS = [
  "id",
  "package",
  "nodePathContains",
  "advisories",
  "severity",
  "owner",
  "issue",
  "expiresOn",
  "reason",
  "removalPlan",
];

const VALID_SEVERITIES = new Set(["low", "moderate", "high", "critical"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateExceptionConfig(exceptionConfig, { requireUpstreamPackage = false } = {}) {
  if (!exceptionConfig || typeof exceptionConfig !== "object" || Array.isArray(exceptionConfig)) {
    throw new Error("le fichier d'exceptions doit contenir un objet JSON.");
  }

  const { exceptions = [] } = exceptionConfig;
  if (!Array.isArray(exceptions)) {
    throw new Error("`exceptions` doit être un tableau.");
  }

  const errors = [];

  for (const [index, exception] of exceptions.entries()) {
    const label = exception?.id ?? `index ${index}`;

    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      errors.push(`[${label}] chaque exception doit être un objet JSON.`);
      continue;
    }

    for (const field of REQUIRED_EXCEPTION_FIELDS) {
      if (field === "advisories") {
        if (
          !Array.isArray(exception[field]) ||
          exception[field].length === 0 ||
          exception[field].some((advisory) => !isNonEmptyString(advisory))
        ) {
          errors.push(`[${label}] advisories doit être un tableau non vide d'identifiants.`);
        }
        continue;
      }

      if (!isNonEmptyString(exception[field])) {
        errors.push(`[${label}] champ obligatoire invalide: ${field}.`);
      }
    }

    if (requireUpstreamPackage && !isNonEmptyString(exception.upstreamPackage)) {
      errors.push(`[${label}] champ obligatoire invalide: upstreamPackage.`);
    }

    if (
      exception.effectContains !== undefined &&
      !isNonEmptyString(exception.effectContains)
    ) {
      errors.push(`[${label}] champ optionnel invalide: effectContains.`);
    }

    if (isNonEmptyString(exception.severity) && !VALID_SEVERITIES.has(exception.severity)) {
      errors.push(
        `[${label}] severity doit être l'une de: ${Array.from(VALID_SEVERITIES).join(", ")}.`
      );
    }

    if (isNonEmptyString(exception.expiresOn) && !isValidIsoDate(exception.expiresOn)) {
      errors.push(`[${label}] expiresOn doit être une date ISO YYYY-MM-DD valide.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return exceptions;
}

export function getHighSeverityAdvisoryIds(vulnerability, vulnerabilities) {
  const ids = new Set();
  const visited = new Set();

  function visitVia(via) {
    for (const item of via ?? []) {
      if (typeof item === "string") {
        if (visited.has(item)) continue;
        visited.add(item);
        visitVia(vulnerabilities[item]?.via);
      } else if (
        item &&
        ["high", "critical"].includes(item.severity) &&
        item.source !== undefined &&
        item.source !== null
      ) {
        ids.add(String(item.source));
      }
    }
  }

  visitVia(vulnerability?.via);
  return [...ids].sort();
}

export function hasExactAdvisories(expected, actual) {
  const expectedIds = [...expected].map(String).sort();
  const actualIds = [...actual].map(String).sort();
  return (
    expectedIds.length === actualIds.length &&
    expectedIds.every((advisory, index) => advisory === actualIds[index])
  );
}
