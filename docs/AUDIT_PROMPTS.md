# Prompts d'audit réutilisables

Ces prompts sont à copier dans n'importe quel agent (Claude, Copilot, etc.) qui a accès au dépôt.
La mission complète de l'auditeur est décrite dans `.github/agents/my-agent.agent.md`.

## Règles à ajouter à chaque demande

- Cite le fichier et la ligne pour chaque constat.
- N'invente rien : écris « non vérifiable avec les éléments présents » si besoin.
- Indique ton niveau de confiance et ce que tu n'as pas relu.
- Pour chaque problème : emplacement, cause, impact, correction, priorité.
- Réponds en français.

## Audit complet

> Fais un audit complet du dépôt (architecture, code, sécurité OWASP, dépendances, CI/CD, secrets, tests, documentation, exploitation, performance, conformité GitHub). Format : résumé exécutif, forces, problèmes critiques, problèmes importants, améliorations, tableau de priorisation, plan d'action (24 h / 7 j / 30 j / long terme), check-list finale.

## Audits ciblés

- **Sécurité :** Fais une revue OWASP de `amplify/`. Pour chaque risque : scénario d'attaque, cause, correction.
- **CI/CD :** Audite chaque workflow de `.github/workflows/` : permissions, pinning des actions, secrets, injection de variables.
- **Autorisations :** Pour chaque modèle de `amplify/data/resource.ts` et pour `amplify/storage/resource.ts`, dis qui peut lire, écrire et supprimer.
- **Dépendances :** Compare `npm audit` avec `.github/security/audit-exceptions.json` et indique les exceptions retirables.
- **Tests :** Quelles parties critiques ne sont pas testées ? Propose les tests à écrire.
- **Exploitation :** Que se passe-t-il si YouTube est en panne, si un webhook échoue, si une clé expire ?
- **Performance :** Où y a-t-il trop d'appels réseau ou d'écritures DynamoDB ?
- **Documentation :** Un nouveau développeur peut-il installer et déployer en suivant le README ?

## Suivi

- Corrige le point `<ID>` de l'audit, puis lance typecheck et tests.
- Relis ton audit et liste ce que tu n'as pas pu vérifier.
- Refais l'audit après mes corrections et compare avec le précédent.
- Revue sécurité des changements de cette PR avant fusion.
- Cherche les erreurs et oublis de cet audit (second avis).

## Rythme conseillé

- Audit complet avant chaque mise en production ou ouverture publique.
- Audit ciblé après chaque changement important.
- Contrôle des dépendances chaque mois.
