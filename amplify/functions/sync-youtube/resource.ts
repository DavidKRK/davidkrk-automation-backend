import { defineFunction } from "@aws-amplify/backend";

/**
 * Fonction planifiée : sync-youtube
 * Déclenchée toutes les 6 heures via un cron Amplify.
 * Elle récupère les dernières vidéos de la chaîne YouTube de DavidKRK
 * et les stocke dans le modèle ContentPost.
 *
 * Variables d'environnement requises (à configurer dans AWS Amplify Console) :
 *   YOUTUBE_API_KEY    — clé API Google / YouTube Data API v3
 *   YOUTUBE_CHANNEL_ID — ID de ta chaîne YouTube (ex: UCxxxxxxxxxxxxxxxx)
 */
export const syncYoutubeFunction = defineFunction({
  name: "sync-youtube",
  // Déclenchement automatique toutes les 6 heures
  schedule: "rate(6 hours)",
  environment: {
    YOUTUBE_API_KEY: "",     // À remplir dans Amplify Console > Env vars
    YOUTUBE_CHANNEL_ID: "",  // À remplir dans Amplify Console > Env vars
  },
  entry: "./handler.ts",
});
