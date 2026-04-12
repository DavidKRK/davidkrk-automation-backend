# sync-youtube — Fonction planifiée V1.0

Cette Lambda Amplify Gen 2 synchronise automatiquement les vidéos YouTube
de la chaîne **DavidKRK** vers la table DynamoDB `ContentPost`.

## Fréquence

Toutes les **6 heures** (configurable dans `resource.ts` → `schedule`).

## Variables d'environnement

À définir dans **Amplify Console → App settings → Environment variables** :

| Variable            | Description                                          | Exemple                  |
|---------------------|------------------------------------------------------|---------------------------|
| `YOUTUBE_API_KEY`   | Clé API Google Cloud (YouTube Data API v3 activée)   | `AIzaSy...`              |
| `YOUTUBE_CHANNEL_ID`| ID de la chaîne YouTube (commence par UC...)         | `UCxxxxxxxxxxxxxxxxxxxxxxx` |

> ⚠️ Ne jamais committer ces valeurs dans le code source.

## Comment obtenir les variables

### YOUTUBE_API_KEY
1. Aller sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créer un projet ou utiliser un projet existant
3. Activer l'API **YouTube Data API v3**
4. `APIs & Services → Credentials → Create credentials → API Key`
5. Restreindre la clé aux IP du Lambda ou à l'API YouTube uniquement

### YOUTUBE_CHANNEL_ID
1. Aller sur ta chaîne YouTube
2. `Paramètres → Informations sur la chaîne → ID de la chaîne`
3. Ou depuis l'URL : `https://www.youtube.com/channel/UCxxxxxxxx` → prendre `UCxxxxxxxx`

## Quota YouTube Data API v3

| Appel               | Coût quota |
|---------------------|------------|
| `channels.list`     | 1 unité    |
| `playlistItems.list`| 1 unité    |
| **Total / exécution**| **~2 unités** |

Avec 10 000 unités/jour gratuites et 4 exécutions/jour (toutes les 6h),
la consommation est de **~8 unités/jour** (très en dessous du quota gratuit).

## Flux d'exécution

```
1. channels.list(channelId)  →  uploadsPlaylistId
2. playlistItems.list(uploadsPlaylistId, maxResults=50)
3. Pour chaque vidéo :
   - Vérifie si externalId existe déjà dans DynamoDB
   - Si non → PutItem dans ContentPost
   - Si oui → skip (pas de doublon)
```

## Modèle de données ContentPost

```
source        : 'youtube'
externalId    : videoId YouTube
title         : titre de la vidéo
url           : https://www.youtube.com/watch?v={videoId}
publishedAt   : date ISO 8601
thumbnailUrl  : URL de la miniature (maxres > high > default)
description   : 500 premiers caractères de la description
status        : 'published'
rawJson       : snippet brut (debug)
```
