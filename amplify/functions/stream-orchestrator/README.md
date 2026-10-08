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
- `ALLOW_SIMULATED_CONNECTORS` (optionnel, `true` pour simuler sans webhook uniquement en sandbox/dev ; la branche et l'environnement Amplify sont transmis par le backend)

Le secret webhook doit être généré avec au moins 32 octets aléatoires, encodés en Base64 (par exemple `openssl rand -base64 32`), et configuré comme secret Amplify dans chaque environnement. Les URLs webhook et les paramètres de simulation sont définis dans les variables de l'application Amplify, puis transmis à la Lambda lors de la synthèse du backend.

## Protection anti-rejeu

- `X-Signature` conserve la compatibilité historique (HMAC SHA-256 du corps JSON).
- `X-Signature-Timestamped` est calculé sur `X-Timestamp + "." + corps JSON` pour empêcher le rejeu avec horodatage modifié.
- Le récepteur doit rejeter toute requête dont `X-Timestamp` dépasse la fenêtre de fraîcheur prévue, puis vérifier `X-Signature-Timestamped` avec le même secret.
