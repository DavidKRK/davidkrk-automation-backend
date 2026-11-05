# Audit des exceptions `npm audit` Amplify (issue #171)

Date de l'audit : 2026-10-30 · Échéance des exceptions : **2026-11-15** (non prolongée).
Méthode : `npm audit --json` sur `package-lock.json` (registre npm joignable), puis `getHighSeverityAdvisoryIds` du gate CI (`.github/scripts/security-exception-config.mjs`) pour obtenir les identifiants d'avis exacts comparés par la policy.

## 1. Résumé

- Aucun des 8 paquets directs n'a de correctif : `fixAvailable: false` partout.
- Sept paquets sont déjà à leur dernière version publiée ; `backend-cli` (1.4.1 → 1.10.0) et `backend` (1.8.0 → 1.25.1) ont une version plus récente.
- **Test des mises à niveau** (copie temporaire, `npm install --package-lock-only` de `@aws-amplify/backend@^1.25.1` et `@aws-amplify/backend-cli@^1.10.0`) : les mêmes avis subsistent et le total passe de 43 à 46 vulnérabilités. Une version plus récente n'est donc **pas** une correction ; aucune montée de version n'est appliquée.
- Conclusion : aucune exception ne peut être retirée aujourd'hui.

## 2. Constat : les exceptions étaient périmées

Les exceptions référençaient l'avis `1240992`, qui n'apparaît plus dans l'audit courant. La policy exige une égalité exacte des avis (`hasExactAdvisories`), donc le gate CI échouait (8 blocages, 0 exception active), et `@aws-amplify/backend` (direct, high) n'avait aucune exception, contrairement à ce que disait l'issue.

| Paquet | Installé | Dernière | Avis exacts (audit courant) |
|---|---|---|---|
| @aws-amplify/backend | 1.8.0 | 1.25.1 | 1241230, 1241677, 1242173, 1242879, 1243066 |
| @aws-amplify/backend-auth | 1.10.1 | 1.10.1 | 1243066 |
| @aws-amplify/backend-cli | 1.4.1 | 1.10.0 | 1241230, 1241677, 1242173, 1242879, 1243066 |
| @aws-amplify/backend-data | 1.9.0 | 1.9.0 | 1241230, 1241677, 1242173, 1242879, 1243066 |
| @aws-amplify/backend-function | 1.19.0 | 1.19.0 | 1243066 |
| @aws-amplify/backend-storage | 1.6.0 | 1.6.0 | 1243066 |
| @aws-amplify/data-construct | 1.17.8 | 1.17.8 | 1243066 |
| @aws-amplify/graphql-api-construct | 1.22.3 | 1.22.3 | 1243066 |

Avis sous-jacents : zod `<4.6.6` (GHSA-mrhx-c7xc-m3w5, 1243066), `@graphql-tools/utils` (GHSA-7mx3-vvmw-hjmv, GHSA-c4qx-w738-7hr3), handlebars (GHSA-xw65-4hp5-5hc7, GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f).

## 3. Changements appliqués

`.github/security/audit-exceptions.json` : avis alignés sur l'audit courant ; ajout de l'exception `@aws-amplify/backend` ; échéance inchangée. Pour cinq paquets l'ensemble d'avis se réduit à `1243066` ; pour `backend-cli`/`backend-data` il s'élargit de deux avis (1242879, 1243066) : ce sont des findings réels et vérifiés, pas un masquage. Le gate passe à 0 blocage.

## 4. Risques et évaluation

- Zod `<4.6.6` : aucune 3.x corrigée ; les paquets Amplify installent zod 3.24/3.25. Forcer zod 4 via `overrides` serait un changement majeur non validé (risque de rupture de `cdk synth`/`ampx`) — **à ne pas faire** sans test Amplify.
- Exposition : outillage de build/CDK (devDependencies et constructs de synthèse), pas le code des Lambdas. Risque principal : DoS mémoire/CPU ou injection via entrées de build non fiables (schémas/templates), donc faible si seul le dépôt de confiance est synthétisé. Confiance : moyenne (analyse non exhaustive des chemins d'exécution).
- `@aws-amplify/backend` ^1.8.0 : le lockfile résout 1.8.0 ; une montée vers 1.25.1 est souhaitable pour la maintenance mais ne corrige pas les avis (voir §1).
- Aucun ignore Dependabot présent dans `.github/dependabot.yml` : rien à retirer.

## 5. Reste à faire

1. Surveiller chaque semaine (`security-upstream-monitor`) : publication d'une version Amplify qui met à jour zod ≥ 4.6.6, `@graphql-tools/utils` > 12.0.1 et handlebars > 4.7.9.
2. À la sortie d'un correctif : `npm install` ciblé, puis `npm ci`, `npm audit --json` complet, `npm run typecheck`, `npm test`, `npx ampx sandbox`/synthèse ; retirer l'exception correspondante.
3. Avant le 2026-11-15, si un avis persiste : joindre l'audit v2 complet, consigner le risque accepté et faire approuver une nouvelle échéance justifiée.
4. Ne pas clore #171 tant que l'audit v2 n'est pas propre ou que chaque exception n'est pas retirée/renouvelée.
