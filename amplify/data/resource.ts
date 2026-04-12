import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Schéma V1.0 — ContentPost
 * Stocke les vidéos YouTube synchronisées depuis la chaîne DavidKRK.
 * Authorization : lecture publique via API Key, écriture réservée à la fonction
 * sync-youtube via IAM (lambdaFunctionAccess sera ajouté dans backend.ts).
 */
const schema = a.schema({
  ContentPost: a
    .model({
      /** Source du contenu : 'youtube' | 'soundcloud' | 'mixcloud' | ... */
      source: a.string().required(),
      /** ID externe de la vidéo/track (ex: YouTube videoId) */
      externalId: a.string().required(),
      /** Titre de la vidéo */
      title: a.string().required(),
      /** URL publique de la vidéo (ex: https://www.youtube.com/watch?v=...) */
      url: a.string().required(),
      /** Date de publication ISO 8601 */
      publishedAt: a.string().required(),
      /** URL de la miniature (thumbnail) */
      thumbnailUrl: a.string(),
      /** Description courte / extrait */
      description: a.string(),
      /** Statut : 'published' | 'draft' | 'archived' */
      status: a.string().required(),
      /** JSON brut de la réponse API (pour debug / enrichissement futur) */
      rawJson: a.string(),
    })
    .secondaryIndexes((index) => [
      // Permet à la Lambda de vérifier l'existence d'une vidéo par (source, externalId)
      index("source").sortKeys(["externalId"]).name("byExternalId"),
    ])
    .authorization((allow) => [
      // Lecture publique via API Key (ton site front)
      allow.publicApiKey().to(["read", "list"]),
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
