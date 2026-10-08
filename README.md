# davidkrk-automation-backend

Backend AWS Amplify Gen 2 pour l'automatisation de la chaîne **DavidKRK** — synchronisation YouTube, gestion des uploads utilisateurs et API publique.

## Architecture

| Ressource | Service AWS | Rôle |
|-----------|-------------|------|
| `auth` | Amazon Cognito | Authentification des utilisateurs |
| `data` | AWS AppSync + DynamoDB | API GraphQL + modèles `ContentPost` et `UserUpload` |
| `storage` | Amazon S3 | Stockage des fichiers uploadés |
| `sync-youtube` | Lambda (planifiée) | Synchronisation YouTube toutes les heures |
| `stream-orchestrator` | Lambda (planifiée) | Orchestration multi-plateformes (pré-live/live/post-live) toutes les 5 min |
| `post-live-maintenance` | Lambda (planifiée) | Archivage post-live, enrichissement et republication toutes les 1 h |

## Modèles de données

### ContentPost
Vidéos YouTube synchronisées automatiquement depuis la chaîne DavidKRK.
- Lecture/liste publique via API Key
- Écriture via la Lambda `sync-youtube` (IAM)

### StreamDestination
Configuration des destinations de diffusion (YouTube, Twitch, Facebook, etc.).
- Gestion des URLs/keys/tokens via références de secrets
- Activation/désactivation par destination

### StreamSession
Session de livestream pilotée par orchestrateur backend.
- Cycle de vie: `pending` → `starting` → `live` → `ending` → `ended`/`failed`
- Suivi centralisé des résultats et erreurs par destination

### UserUpload
Fichiers uploadés par les utilisateurs authentifiés (audio, images, etc.).
- CRUD propriétaire via User Pool (Cognito)

## Prise en main

1. Cloner le dépôt :

```bash
git clone https://github.com/DavidKRK/davidkrk-automation-backend.git
cd davidkrk-automation-backend
```

2. Installer les dépendances :

```bash
npm ci
```

3. Vérifier les types TypeScript :

```bash
npm run typecheck
```

4. Déployer via Amplify CLI :

```bash
npx ampx pipeline-deploy --branch <branche> --app-id <app-id>
```

## Variables d'environnement requises

À définir dans **Amplify Console → App settings → Environment variables** :

| Variable | Description |
|----------|-------------|
| `YOUTUBE_API_KEY` | Clé API Google Cloud (YouTube Data API v3) |
| `YOUTUBE_CHANNEL_ID` | ID de la chaîne YouTube (commence par `UC`) |
| `YOUTUBE_LIVE_WEBHOOK_URL` | Endpoint d'intégration live YouTube (optionnel) |
| `TWITCH_LIVE_WEBHOOK_URL` | Endpoint d'intégration live Twitch (optionnel) |
| `FACEBOOK_LIVE_WEBHOOK_URL` | Endpoint d'intégration live Facebook Page (optionnel) |
| `CONNECTOR_WEBHOOK_SECRET` | Secret Amplify utilisé pour signer les appels webhook sortants |
| `ALLOW_SIMULATED_CONNECTORS` | `true` pour autoriser un mode simulation sans webhook uniquement en sandbox/dev quand `AWS_BRANCH` ou `AMPLIFY_ENV` est défini (sinon échec explicite) |

### Contrôles opérationnels avant mise en production

Chaque environnement doit être créé et déployé séparément dans Amplify. Avant un déploiement de production, l’opérateur doit vérifier dans la console que la branche cible est `main`, que l’application et les ressources AWS sont celles de production, et que chaque variable et secret requis a été configuré dans le scope de cette application uniquement. Ne copiez jamais les valeurs de secret dans Git, les journaux ou les tickets. En production, `ALLOW_SIMULATED_CONNECTORS` doit rester `false`; les URLs webhook configurées doivent être en HTTPS.

Checklist de mise en service :

- [ ] Confirmer les identifiants d’application/branche et les ressources AWS du bon environnement.
- [ ] Confirmer les permissions IAM, variables et secrets séparés pour sandbox et production, sans afficher leurs valeurs.
- [ ] Exécuter typecheck, tests et audit sur le commit candidat ; vérifier que les checks CI requis sont verts.
- [ ] Vérifier les URLs webhook et effectuer un test opérationnel contrôlé avant ouverture du trafic.
- [ ] Identifier l’opérateur, le responsable de validation et le build Amplify précédent auquel revenir.

### Rollback et réponse à incident

En cas d’échec de déploiement ou de régression, suspendre les opérations automatisées concernées et limiter le trafic ou désactiver l’intégration touchée. Dans Amplify Console, redéployer le dernier build connu comme sain sur la même branche/environnement ; ne basculez pas vers une branche ou une application d’un autre environnement. Vérifier ensuite les logs Lambda/AppSync, les alarmes, les appels webhook et les écritures DynamoDB, puis confirmer le retour au service normal.

Pour un incident impliquant un secret, révoquer le secret et en faire une rotation dans son environnement, mettre à jour la configuration sans le publier, et vérifier les journaux pour repérer les usages anormaux. Pour toute modification de schéma ou de clé DynamoDB, arrêter le déploiement et restaurer depuis le point de sauvegarde DynamoDB vérifié selon la procédure de l’opérateur AWS ; ne pas tenter une restauration destructive ou rejouer des écritures sans validation. Consigner la chronologie, l’impact, les actions et le suivi dans un ticket d’incident. Ces contrôles doivent être confirmés dans l’environnement AWS réel avant d’affirmer que la production est prête.

## Lancement d'un livestream (V1)

1. Créer/activer les `StreamDestination` (YouTube/Twitch/Facebook).
2. Créer une `StreamSession` avec `status = pending` et les destinations ciblées (`destinationsJson`).
3. Démarrer le stream dans OBS (profil/scène).
4. `stream-orchestrator` exécute automatiquement:
   - Pré-live (préparation plateformes)
   - Live (démarrage)
   - Post-live (arrêt selon `plannedEndAt`)
5. `post-live-maintenance` archive la session terminée dans `ContentPost`.

## Incidents fréquents

- **Aucune destination active**: la session passe en `failed` avec `lastError`.
- **Plateforme non supportée**: la destination est rejetée au niveau orchestrateur.
- **Webhook indisponible**: la phase concernée échoue, la session passe en `failed`.
- **Archive déjà créée**: ignorée automatiquement (idempotence DynamoDB).

> ⚠️ Ne jamais committer ces valeurs dans le code source.

Voir [`amplify/functions/sync-youtube/README.md`](amplify/functions/sync-youtube/README.md) pour le détail de la Lambda.

## Sécurité

Voir [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) pour plus d'informations.

## Licence

Ce projet est sous licence MIT-0. Voir le fichier LICENSE.
