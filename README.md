# davidkrk-automation-backend

Backend AWS Amplify Gen 2 pour l'automatisation de la chaîne **DavidKRK** — synchronisation YouTube, gestion des uploads utilisateurs et API publique.

## Architecture

| Ressource | Service AWS | Rôle |
|-----------|-------------|------|
| `auth` | Amazon Cognito | Authentification des utilisateurs |
| `data` | AWS AppSync + DynamoDB | API GraphQL + modèles `ContentPost` et `UserUpload` |
| `storage` | Amazon S3 | Stockage des fichiers uploadés |
| `sync-youtube` | Lambda (planifiée) | Synchronisation YouTube toutes les 6 h |

## Modèles de données

### ContentPost
Vidéos YouTube synchronisées automatiquement depuis la chaîne DavidKRK.
- Lecture/liste publique via API Key
- Écriture via la Lambda `sync-youtube` (IAM)

### UserUpload
Fichiers uploadés par les utilisateurs authentifiés (audio, images, etc.).
- CRUD propriétaire via User Pool (Cognito)
- Lecture publique via API Key

## Prise en main

1. Cloner le dépôt :

```bash
git clone https://github.com/DavidKRK/davidkrk-automation-backend.git
cd davidkrk-automation-backend
```

2. Installer les dépendances :

```bash
npm install
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

> ⚠️ Ne jamais committer ces valeurs dans le code source.

Voir [`amplify/functions/sync-youtube/README.md`](amplify/functions/sync-youtube/README.md) pour le détail de la Lambda.

## Sécurité

Voir [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) pour plus d'informations.

## Licence

Ce projet est sous licence MIT-0. Voir le fichier LICENSE.