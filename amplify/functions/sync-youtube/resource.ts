import { defineFunction } from "@aws-amplify/backend";

/**
 * Fonction planifiée sync-youtube
 * Tourne toutes les 6 heures pour synchroniser les vidéos YouTube
 * vers DynamoDB via l'API GraphQL AppSync.
 *
 * Variables d'environnement requises (à configurer dans Amplify Console) :
 *   YOUTUBE_API_KEY     → Clé API Google/YouTube Data v3
 *   YOUTUBE_CHANNEL_ID  → ID de la chaîne YouTube (ex: UCxxxxxxxxxxxxxxxx)
 */
export const syncYoutube = defineFunction({
  name: "sync-youtube",
  // Exécution automatique toutes les 6 heures
  schedule: "every 6 hours",
  // Timeout 5 minutes (suffisant pour paginer jusqu'à 200 vidéos)
  timeoutSeconds: 300,
  // Mémoire suffisante pour les appels HTTP YouTube + AppSync
  memoryMB: 256,
  environment: {
    YOUTUBE_API_KEY: "",     // À remplir dans Amplify Console → Environment variables
    YOUTUBE_CHANNEL_ID: "",  // À remplir dans Amplify Console → Environment variables
  },
});
