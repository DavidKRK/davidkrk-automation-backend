import { defineFunction } from "@aws-amplify/backend";

/**
 * Fonction planifiée : sync-youtube
 *
 * Déclenchée automatiquement toutes les 6 heures.
 * Elle appelle l'API YouTube Data v3 pour récupérer les dernières vidéos
 * de la chaîne DavidKRK et les upsert dans le modèle ContentPost.
 *
 * Variables d'environnement requises dans Amplify Console :
 *   YOUTUBE_API_KEY      — clé API Google Cloud (YouTube Data API v3)
 *   YOUTUBE_CHANNEL_ID   — ID de la chaîne YouTube (ex: UCxxxxxxxxxxxxxxx)
 */
export const syncYoutube = defineFunction({
  name: "sync-youtube",
  entry: "./handler.ts",
  schedule: "every 6h",
  timeoutSeconds: 60,
  environment: {
    YOUTUBE_API_KEY: "",        // À remplir dans Amplify Console → Environment variables
    YOUTUBE_CHANNEL_ID: "",    // À remplir dans Amplify Console → Environment variables
  },
});
