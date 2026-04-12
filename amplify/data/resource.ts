import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Schéma V1.0 — YoutubeVideo
 * Stocke les vidéos synchronisées depuis YouTube Data API v3.
 * Accès public en lecture via API Key (site davidkrk.com).
 */
const schema = a.schema({
  YoutubeVideo: a
    .model({
      /** ID YouTube de la vidéo (ex: dQw4w9WgXcQ) — clé métier pour l'upsert */
      externalId: a.string().required(),
      /** Titre de la vidéo */
      title: a.string().required(),
      /** Description courte (256 premiers caractères) */
      description: a.string(),
      /** Date de publication ISO-8601 */
      publishedAt: a.string().required(),
      /** URL de la miniature haute qualité (hqdefault) */
      thumbnailUrl: a.string(),
      /** URL publique de la vidéo https://youtu.be/<externalId> */
      videoUrl: a.string().required(),
      /** Nombre de vues au moment de la synchro */
      viewCount: a.integer(),
      /** Nombre de likes au moment de la synchro */
      likeCount: a.integer(),
      /** Durée ISO-8601 (ex: PT3M45S) */
      duration: a.string(),
      /** Timestamp ISO-8601 de la dernière synchro */
      syncedAt: a.string().required(),
    })
    .authorization((allow) => [
      // Lecture publique via API Key (frontend davidkrk.com)
      allow.publicApiKey().to(["read", "list"]),
      // Écriture réservée à la fonction Lambda sync-youtube (IAM)
      allow.resource(a.ref("syncYoutube")).to(["create", "update", "delete"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
