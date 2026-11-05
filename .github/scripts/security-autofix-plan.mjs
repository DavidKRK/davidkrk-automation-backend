// Sélectionne, pour une sévérité donnée, les paquets vulnérables corrigeables sans montée majeure.
// Usage : node .github/scripts/security-autofix-plan.mjs <audit.json> <critical|high|moderate|low>
// Écrit count / names (séparés par des espaces) dans $GITHUB_OUTPUT si défini.
import fs from "node:fs";

const [auditPath, severity] = process.argv.slice(2);
const SEVERITIES = ["critical", "high", "moderate", "low"];

if (!auditPath || !SEVERITIES.includes(severity)) {
  console.error("Usage: security-autofix-plan.mjs <audit.json> <critical|high|moderate|low>");
  process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
// Nom de paquet npm valide uniquement : aucune valeur douteuse ne doit atteindre un shell.
const SAFE_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

const names = [];
const manual = [];

for (const [name, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
  if (vuln.severity !== severity) continue;
  const fix = vuln.fixAvailable;
  const autoFixable = fix === true || (typeof fix === "object" && fix !== null && fix.isSemVerMajor === false);
  if (autoFixable && SAFE_NAME.test(name)) {
    names.push(name);
  } else {
    manual.push(name);
  }
}

names.sort();
manual.sort();
console.log(`Sévérité ${severity} : ${names.length} corrigeable(s) automatiquement, ${manual.length} à traiter manuellement.`);
if (names.length) console.log(`Auto : ${names.join(", ")}`);
if (manual.length) console.log(`Manuel : ${manual.join(", ")}`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `count=${names.length}\nnames=${names.join(" ")}\nmanual=${manual.join(", ")}\n`
  );
}
