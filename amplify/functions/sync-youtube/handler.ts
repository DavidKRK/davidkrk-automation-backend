import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Handler de la fonction sync-youtube
 *
 * Flux :
 * 1. Récupère l'ID de la playlist 'uploads' de la chaîne via channels.list
 * 2. Lit les 50 dernières vidéos via playlistItems.list (coût quota : 1 unité/appel)
 * 3. Pour chaque vidéo, upsert dans la table ContentPost DynamoDB si elle n'existe pas encore
 *
 * Quota YouTube Data API v3 :
 *   - channels.list     : 1 unité
 *   - playlistItems.list: 1 unité
 *   Total par exécution : ~2 unités (très économique, max 10 000 unités/jour)
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const MAX_DESCRIPTION_LENGTH = 500;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    console.error(`[sync-youtube] Variable d'environnement requise manquante : ${name}.`);
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

// Le nom de la table DynamoDB est injecté automatiquement par Amplify Gen 2
// via la variable d'environnement générée lors du déploiement.
// Format : <appId>-<branchName>-ContentPost-<hash>
const TABLE_NAME = getRequiredEnv("CONTENT_POST_TABLE_NAME");

export const handler: Handler = async () => {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

  if (!API_KEY || !CHANNEL_ID) {
    console.error(
      "[sync-youtube] Variables manquantes : YOUTUBE_API_KEY ou YOUTUBE_CHANNEL_ID non définies."
    );
    return { statusCode: 500, body: "Configuration incomplète." };
  }

  try {
    // ── ÉTAPE 1 : récupérer l'ID de la playlist 'uploads' ────────────────────
    const channelRes = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${CHANNEL_ID}&key=${API_KEY}`
    );
    if (!channelRes.ok) throw new Error(`channels.list HTTP ${channelRes.status}`);
    const channelData = await channelRes.json() as YouTubeChannelResponse;

    const uploadsPlaylistId =
      channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      throw new Error(`Playlist 'uploads' introuvable pour la chaîne ${CHANNEL_ID}`);
    }
    console.log(`[sync-youtube] Playlist uploads : ${uploadsPlaylistId}`);

    // ── ÉTAPE 2 : récupérer les 50 dernières vidéos ──────────────────────────
    const playlistRes = await fetch(
      `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${API_KEY}`
    );
    if (!playlistRes.ok) throw new Error(`playlistItems.list HTTP ${playlistRes.status}`);
    const playlistData = await playlistRes.json() as YouTubePlaylistResponse;

    const items = playlistData.items ?? [];
    console.log(`[sync-youtube] ${items.length} vidéos récupérées.`);

    let created = 0;
    let skipped = 0;

    // ── ÉTAPE 3 : upsert dans DynamoDB ───────────────────────────────────────
    for (const item of items) {
      const snippet = item.snippet;
      const videoId = snippet?.resourceId?.videoId;
      if (!videoId) continue;

      // Vérifie si la vidéo existe déjà (index externalId + source)
      const existing = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "byExternalId",
          KeyConditionExpression: "#src = :src AND externalId = :vid",
          ExpressionAttributeNames: { "#src": "source" },
          ExpressionAttributeValues: { ":src": "youtube", ":vid": videoId },
          Limit: 1,
        })
      );

      if (existing.Count && existing.Count > 0) {
        skipped++;
        continue;
      }

      const post = {
        id: `youtube_${videoId}`,
        source: "youtube",
        externalId: videoId,
        title: snippet?.title ?? "Sans titre",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: snippet?.publishedAt ?? new Date().toISOString(),
        thumbnailUrl:
          snippet?.thumbnails?.maxres?.url ??
          snippet?.thumbnails?.high?.url ??
          snippet?.thumbnails?.default?.url ??
          "",
        description: (() => {
          const raw = snippet?.description ?? "";
          if (raw.length > MAX_DESCRIPTION_LENGTH) {
            console.warn(
              `[sync-youtube] Description tronquée pour ${videoId} : ${raw.length} → ${MAX_DESCRIPTION_LENGTH} caractères`
            );
          }
          return raw.substring(0, MAX_DESCRIPTION_LENGTH);
        })(),
        status: "published",
        rawJson: JSON.stringify(snippet),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        __typename: "ContentPost",
      };

      try {
        await dynamo.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: post,
            ConditionExpression: "attribute_not_exists(id)",
          })
        );
        created++;
        console.log(`[sync-youtube] Ajouté : ${post.title} (${videoId})`);
      } catch (err) {
        if (
          typeof err === "object" &&
          err !== null &&
          "name" in err &&
          err.name === "ConditionalCheckFailedException"
        ) {
          skipped++;
          console.log(`[sync-youtube] Déjà présente, ignorée : ${post.title} (${videoId})`);
          continue;
        }
        throw err;
      }
    }

    console.log(
      `[sync-youtube] Terminé — ${created} créées, ${skipped} déjà présentes.`
    );
    return { statusCode: 200, body: `${created} vidéos ajoutées.` };
  } catch (err) {
    console.error("[sync-youtube] Erreur :", err);
    throw err;
  }
};

// ── Types YouTube Data API v3 (minimal) ──────────────────────────────────────

interface YouTubeChannelResponse {
  items?: Array<{
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
}

interface YouTubePlaylistResponse {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      resourceId?: { videoId?: string };
      thumbnails?: {
        default?: { url: string };
        high?: { url: string };
        maxres?: { url: string };
      };
    };
  }>;
}
