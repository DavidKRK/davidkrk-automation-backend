# davidkrk-automation-backend

Backend AWS Amplify Gen 2 pour [davidkrk.com](https://davidkrk.com).

Ce backend automatise la récupération et la diffusion des contenus de David KRK
(DJ, producteur, Saint-Jean-de-Luz) depuis YouTube et les plateformes musicales.

## Architecture V1.0

```
amplify/
├── auth/                        — Cognito (authentification admin)
├── data/
│   └── resource.ts              — Modèle ContentPost (DynamoDB via AppSync)
├── functions/
│   └── sync-youtube/
│       ├── resource.ts          — Définition de la fonction Lambda planifiée
│       └── handler.ts           — Logique de synchro YouTube Data API v3
└── backend.ts                   — Point d'entrée Amplify
```

## Flux de synchronisation YouTube

1. La fonction `sync-youtube` est déclenchée **toutes les 6 heures** (cron Amplify).
2. Elle appelle `channels.list` pour récupérer l'ID de la playlist `uploads`.
3. Elle lit les vidéos via `playlistItems.list` (1 unité de quota — économique).
4. Chaque vidéo est upsertée dans le modèle **ContentPost** (DynamoDB).
5. Le site `davidkrk.com` lit les posts via l'API AppSync (clé publique en lecture seule).

## Variables d'environnement à configurer

Dans **Amplify Console → ton environnement → Environment variables** :

| Variable             | Description                              |
|----------------------|------------------------------------------|
| `YOUTUBE_API_KEY`    | Clé API Google / YouTube Data API v3     |
| `YOUTUBE_CHANNEL_ID` | ID de ta chaîne YouTube (UCxxxxxxxx…)    |

## Roadmap

- **V1.0** ✅ YouTube — modèle ContentPost + Lambda planifiée
- **V1.1** — Connexion réelle DynamoDB (upsert via client Amplify Data)
- **V1.2** — SoundCloud / Mixcloud
- **V1.3** — Endpoint public REST pour le site

## Stack technique

- AWS Amplify Gen 2
- TypeScript
- AWS Lambda (Node.js 20)
- DynamoDB (via AppSync)
- YouTube Data API v3
