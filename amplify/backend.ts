import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { syncYoutubeFunction } from './functions/sync-youtube/resource';

/**
 * Backend DavidKRK — V1.0 YouTube
 * Modules actifs :
 *   - auth     : Cognito (utilisateur admin)
 *   - data     : DynamoDB via AppSync (modèle ContentPost)
 *   - syncYoutubeFunction : Lambda planifiée toutes les 6h
 */
defineBackend({
  auth,
  data,
  syncYoutubeFunction,
});
