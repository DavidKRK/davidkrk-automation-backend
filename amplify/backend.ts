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

if (!contentPostTable) {
  throw new Error(
    'Missing DynamoDB table "ContentPost" in backend.data.resources.tables. Verify that the model/table name still matches "ContentPost" and that the data resources were generated successfully.'
  );
}

if (!lambdaFunction) {
  throw new Error(
    'Missing Lambda resource for "syncYoutube" at backend.syncYoutube.resources.lambda. Verify that the function resource is defined and generated as expected.'
  );
}
// Accorde à la Lambda les droits de lecture/écriture sur la table DynamoDB
contentPostTable.grantReadWriteData(lambdaFunction);

// Injecte le nom de la table dans les variables d'environnement de la Lambda
backend.syncYoutube.addEnvironment(
  "CONTENT_POST_TABLE_NAME",
  contentPostTable.tableName
);
