# sync-social

Lambda planifiee qui synchronise des contenus depuis:
- Instagram
- Twitch
- TikTok

Chaque element est insere de maniere idempotente dans `ContentPost` avec la cle `(source, externalId)`.

## Variables d environnement

Variable obligatoire:
- `CONTENT_POST_TABLE_NAME`

Variable optionnelle:
- `SOCIAL_SYNC_LIMIT` (defaut `20`)

Instagram:
- `INSTAGRAM_ACCESS_TOKEN`

Twitch:
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_USER_ID`

TikTok:
- `TIKTOK_ACCESS_TOKEN`

Si les variables d une plateforme sont absentes, la source est ignoree sans faire echouer toute la Lambda.
