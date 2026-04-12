import { defineFunction } from "@aws-amplify/backend";

/**
 * Fonction planifiée : sync-youtube
 * Déclenchée toutes les 6 heures via un cron Amplify.
 * Elle récupère les dernières vidéos de la chaîne YouTube de DavidKRK
 * et les stocke dans le modèle ContentPost.
 *
 * Variables d'environnement REQUISES — à configurer dans Amplify Console :
 *   Amplify Console → ton environnement → Environment variables
 *
 *   YOUTUBE_API_KEY    — clé API Google / YouTube Data API v3
 *   YOUTUBE_CHANNEL_ID — ID de ta chaîne YouTube (ex: UCxxxxxxxxxxxxxxxx)
 *
 * NE PAS mettre ces valeurs ici dans le code — risque de fuite dans le repo.
 */
export const syncYoutubeFunction = defineFunction({
  name: "sync-youtube",
  // Déclenchement automatique toutes les 6 heures
  schedule: "rate(6 hours)",
  entry: "./handler.ts",
});
