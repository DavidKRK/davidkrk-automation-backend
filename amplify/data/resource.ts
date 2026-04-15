import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { syncYoutube } from "../functions/sync-youtube/resource";

/**
 * Modèle ContentPost — source unique de vérité pour les vidéos YouTube
 * (et autres sources sociales à venir : SoundCloud, Mixcloud…)
 *
 * Champs :
 *  - source        : identifiant de la plateforme ("youtube", "soundcloud", etc.)
 *  - externalId    : ID unique de la vidéo/track côté plateforme — clé métier pour l'upsert
 *  - title         : titre de la vidéo
 *  - description   : description courte
 *  - url           : lien direct vers la vidéo
 *  - thumbnailUrl  : URL de la miniature
 *  - publishedAt   : date de publication (ISO 8601)
 *  - status        : "published" | "draft" | "hidden"
 *  - rawJson       : payload brut de l'API (pour debug et évolution)
 *
 * Authorization :
 *  - Lecture publique via API Key
 *  - Écriture (create/update/delete) réservée à la Lambda syncYoutube via IAM
 */
const schema = a.schema({
  ContentPost: a
    .model({
      source: a.string().required(),
      externalId: a.string().required(),
      title: a.string().required(),
      description: a.string(),
      url: a.string().required(),
      thumbnailUrl: a.string(),
      publishedAt: a.string(),
      status: a.enum(["published", "draft", "hidden"]),
      rawJson: a.string(),
    })
    .identifier(["source", "externalId"])
    .authorization((allow) => [
      allow.publicApiKey().to(["read", "list"]),
      allow.resource(syncYoutube).to(["create", "update", "delete"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      // Durée réduite pour limiter l'impact d'une fuite et favoriser la rotation
      expiresInDays: 30,
    },
  },
});
