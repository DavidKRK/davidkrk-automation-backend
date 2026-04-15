import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Schéma V1.1 — ContentPost + UserUpload
 * ContentPost  : vidéos YouTube synchronisées depuis la chaîne DavidKRK.
 * UserUpload   : fichiers uploadés par les utilisateurs authentifiés (S3).
 * Authorization : lecture publique via API Key, écriture propriétaire via User Pool.
 */
const schema = a.schema({
  /**
   * UserUpload — Fichier uploadé par un utilisateur authentifié
   * Autorisations : propriétaire (CRUD), lecture publique via API Key.
   */
  UserUpload: a
    .model({
      /** Clé S3 de l'objet (ex: uploads/{entity_id}/mon-fichier.mp3) */
      key: a.string().required(),
      /** Nom de fichier d'origine */
      filename: a.string().required(),
      /** Type MIME (ex: audio/mpeg, image/jpeg) */
      fileType: a.string().required(),
      /** Taille en octets */
      fileSize: a.integer(),
      /** Titre affiché */
      title: a.string().required(),
      /** Description optionnelle */
      description: a.string(),
      /** Statut : 'pending' | 'processing' | 'published' | 'rejected' */
      status: a.string().required(),
      /** URL publique du fichier (renseignée après traitement) */
      publicUrl: a.string(),
    })
    .authorization((allow) => [
      // Le propriétaire peut créer, lire, modifier et supprimer ses uploads (nécessite User Pool)
      allow.owner(),
      // Lecture publique via API Key limitée aux items publiés (pas de list : évite l'exposition de données sensibles)
      allow.publicApiKey().to(["read"]),
    ]),

  ContentPost: a
    .model({
      /** Source du contenu : 'youtube' | 'soundcloud' | 'mixcloud' | ... */
      source: a.string().required(),
      /** ID externe de la vidéo/track (ex: YouTube videoId) — forme la clé composite avec source */
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
    // Clé composite (source, externalId) — garantit l'unicité au niveau DynamoDB
    // et permet à la Lambda de faire une insertion idempotente (create-if-not-exists) sans index secondaire.
    .identifier(["source", "externalId"])
    .authorization((allow) => [
      // Lecture publique via API Key (ton site front)
      allow.publicApiKey().to(["read", "list"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Mode par défaut : API Key (lecture publique ContentPost / UserUpload)
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
    // Le mode User Pool (requis pour allow.owner()) est automatiquement activé
    // par Amplify Gen 2 lorsque la ressource auth est déclarée dans defineBackend.
  },
});
