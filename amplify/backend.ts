import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { syncYoutube } from './functions/sync-youtube/resource';

/**
 * Backend V1.0 — DavidKRK Automation
 *
 * Ressources actives :
 *  - auth        : Cognito User Pool (généré par le template)
 *  - data        : AppSync + DynamoDB (modèle ContentPost)
 *  - syncYoutube : Lambda planifiée toutes les 6h (YouTube Data API v3)
 */
defineBackend({
  auth,
  data,
  syncYoutube,
});
