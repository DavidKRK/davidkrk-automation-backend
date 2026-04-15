import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { syncYoutube } from './functions/sync-youtube/resource';

/**
 * Backend V1.1 — DavidKRK Automation
 *
 * Ressources actives :
 *  - auth        : Cognito User Pool (généré par le template)
 *  - data        : AppSync + DynamoDB (modèles ContentPost et UserUpload)
 *  - storage     : S3 bucket pour les uploads utilisateur
 *  - syncYoutube : Lambda planifiée toutes les 6h (YouTube Data API v3)
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  syncYoutube,
});

// Récupère la table DynamoDB ContentPost et la fonction Lambda
const contentPostTable = backend.data.resources.tables["ContentPost"];
const lambdaFunction = backend.syncYoutube.resources.lambda;

// Accorde à la Lambda les droits de lecture/écriture sur la table DynamoDB
contentPostTable.grantReadWriteData(lambdaFunction);

// Injecte le nom de la table dans les variables d'environnement de la Lambda
backend.syncYoutube.addEnvironment(
  "CONTENT_POST_TABLE_NAME",
  contentPostTable.tableName
);
