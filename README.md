# davidkrk-automation-backend

Backend automatisation de [davidkrk.com](https://davidkrk.com) — propulsé par **AWS Amplify Gen 2**.

## V1.0 — YouTube Sync

La V1.0 synchronise automatiquement les vidéos YouTube de la chaîne vers DynamoDB via AppSync GraphQL.

### Architecture

```
YouTube Data API v3
        │
        ▼
  Lambda sync-youtube  (planifiée toutes les 6h)
        │  channels.list → playlistItems.list → videos.list
        ▼
  AppSync GraphQL API
        │  upsert YoutubeVideo (idempotent sur externalId)
        ▼
  DynamoDB
        │
        ▼
  davidkrk.com  (lecture publique via API Key)
```

### Modèle de données

| Champ | Type | Description |
|---|---|---|
| `externalId` | String | ID YouTube de la vidéo |
| `title` | String | Titre |
| `description` | String | 256 premiers caractères |
| `publishedAt` | String | Date ISO-8601 |
| `thumbnailUrl` | String | URL miniature HQ |
| `videoUrl` | String | `https://youtu.be/<id>` |
| `viewCount` | Int | Vues au moment de la synchro |
| `likeCount` | Int | Likes au moment de la synchro |
| `duration` | String | Durée ISO-8601 (ex: PT3M45S) |
| `syncedAt` | String | Timestamp dernière synchro |

### Variables d'environnement

À configurer dans **Amplify Console → Environment variables** :

| Variable | Description |
|---|---|
| `YOUTUBE_API_KEY` | Clé API Google Cloud (YouTube Data v3) |
| `YOUTUBE_CHANNEL_ID` | ID de ta chaîne YouTube (ex: `UCxxxxxxxx`) |

Les variables `AMPLIFY_DATA_GRAPHQL_ENDPOINT` et `AMPLIFY_DATA_API_KEY` sont **injectées automatiquement** par Amplify Gen 2 dans la Lambda.

### Démarrage local (sandbox)

```bash
# 1. Installe les dépendances
npm install

# 2. Lance le sandbox Amplify (déploie en local sur ton compte AWS)
npx ampx sandbox

# 3. Génère le client GraphQL pour le frontend
npm run generate:graphql-client-code
```

### Roadmap

- **V1.1** — SoundCloud sync (dernières tracks)
- **V1.2** — Bandcamp sync (releases, albums)
- **V1.3** — Events sync (RA / Facebook Events)
- **V2.0** — Dashboard admin pour davidkrk.com
