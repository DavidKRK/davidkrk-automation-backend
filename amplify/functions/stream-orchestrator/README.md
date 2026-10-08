# stream-orchestrator

Lambda planifiée toutes les 5 minutes pour piloter les sessions de livestream (`StreamSession`) vers les destinations configurées (`StreamDestination`).

## Phases gérées

- `pending` -> `starting` via `prepareLive`
- `starting` -> `live` via `startLive`
- `live` -> `ending` quand `plannedEndAt` est atteint
- `ending` -> `ended` via `stopLive`

## Variables d'environnement

- `STREAM_SESSION_TABLE_NAME`
- `STREAM_DESTINATION_TABLE_NAME`
- `YOUTUBE_LIVE_WEBHOOK_URL` (optionnel)
- `TWITCH_LIVE_WEBHOOK_URL` (optionnel)
- `FACEBOOK_LIVE_WEBHOOK_URL` (optionnel)
- `CONNECTOR_WEBHOOK_SECRET` (obligatoire, secret Amplify pour signer les appels sortants)
- `ALLOW_SIMULATED_CONNECTORS` (optionnel, `true` pour simuler sans webhook uniquement en sandbox/dev quand `AWS_BRANCH` ou `AMPLIFY_ENV` identifie l'environnement)

## Protection anti-rejeu

- `X-Signature` est calculé sur `X-Timestamp` et le corps JSON.
- Le récepteur doit rejeter toute requête dont `X-Timestamp` dépasse la fenêtre de fraîcheur prévue avant de vérifier la signature.
