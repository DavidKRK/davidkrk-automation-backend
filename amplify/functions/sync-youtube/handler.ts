import type { Handler } from "aws-lambda";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import * as https from "https";
import { URL } from "url";

/**
 * Handler principal de la fonction sync-youtube.
 *
 * Logique V1.0 :
 *  1. Récupère l'ID de la playlist "uploads" de la chaîne via channels.list
 *  2. Lit les vidéos via playlistItems.list (max 50 par page, pagination complète)
 *  3. Pour chaque vidéo, upsert un ContentPost dans DynamoDB via AppSync (signé IAM/SigV4)
 *
 * Pourquoi playlistItems et pas search.list ?
 *   → search.list coûte 100 unités de quota par appel (très cher)
 *   → playlistItems.list coûte seulement 1 unité — beaucoup plus économique
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT_MS = 10_000;
const DESCRIPTION_MAX_LENGTH = 500;

interface YouTubePlaylistItem {
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    resourceId: { videoId: string };
    thumbnails: { medium?: { url: string }; default?: { url: string } };
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * httpGet — effectue un GET HTTPS avec gestion du timeout, validation du
 * status HTTP et parsing JSON. Lance une Error explicite sur 4xx/5xx.
 */
async function httpGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = "";
      const statusCode = res.statusCode ?? 0;
      const statusMessage = res.statusMessage ?? "";

      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(
            new Error(
              `HTTP ${statusCode}${statusMessage ? ` ${statusMessage}` : ""} for ${url}. Body: ${data}`
            )
          );
          return;
        }
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(new Error(`JSON parse error: ${e}`));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms for ${url}`));
    });

    req.on("error", reject);
  });
}

/**
 * appsyncRequest — effectue une requête GraphQL signée en IAM (SigV4) vers AppSync.
 * Vérifie le status HTTP et la présence d'erreurs GraphQL dans la réponse.
 */
async function appsyncRequest<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const url = new URL(endpoint);
  const body = JSON.stringify({ query, variables });
  const region = process.env.AWS_REGION ?? "eu-west-3";

  const signer = new SignatureV4({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
    region,
    service: "appsync",
    sha256: Sha256,
  });

  const signed = await signer.sign({
    method: "POST",
    hostname: url.hostname,
    path: url.pathname,
    protocol: url.protocol,
    headers: {
      "Content-Type": "application/json",
      host: url.hostname,
    },
    body,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        ...signed.headers,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        reject(new Error(`AppSync Request Failed. Status Code: ${res.statusCode}`));
        return;
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data) as {
            data?: T;
            errors?: Array<{ message?: string }>;
          };
          const statusCode = res.statusCode ?? 0;

          if (statusCode < 200 || statusCode >= 300) {
            const statusMessage = res.statusMessage ? ` ${res.statusMessage}` : "";
            reject(
              new Error(
                `AppSync request failed with HTTP ${statusCode}${statusMessage}: ${data}`
              )
            );
            return;
          }

          if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
            const graphqlMessage = parsed.errors
              .map((e) => e.message ?? JSON.stringify(e))
              .join("; ");
            reject(new Error(`AppSync GraphQL error: ${graphqlMessage}`));
            return;
          }

          resolve(parsed.data as T);
        } catch (e) {
          reject(new Error(`AppSync JSON parse error: ${e}`));
        }
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`AppSync request timeout after ${REQUEST_TIMEOUT_MS}ms`));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// GraphQL mutations/queries
// ---------------------------------------------------------------------------

const CREATE_CONTENT_POST = /* GraphQL */ `
  mutation CreateContentPost($input: CreateContentPostInput!) {
    createContentPost(input: $input) {
      externalId
      title
    }
  }
`;

const UPDATE_CONTENT_POST = /* GraphQL */ `
  mutation UpdateContentPost($input: UpdateContentPostInput!) {
    updateContentPost(input: $input) {
      externalId
      title
    }
  }
`;

const GET_CONTENT_POST = /* GraphQL */ `
  query GetContentPost($externalId: String!) {
    getContentPost(externalId: $externalId) {
      externalId
      title
    }
  }
`;

// ---------------------------------------------------------------------------
// YouTube helpers
// ---------------------------------------------------------------------------

async function getUploadsPlaylistId(
  apiKey: string,
  channelId: string
): Promise<string> {
  const url = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const data = await httpGet<{
    items: Array<{ contentDetails: { relatedPlaylists: { uploads: string } } }>;
  }>(url);

  if (!data.items?.length) {
    throw new Error(`Chaîne YouTube introuvable : ${channelId}`);
  }
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function fetchAllPlaylistItems(
  apiKey: string,
  playlistId: string
): Promise<YouTubePlaylistItem[]> {
  const items: YouTubePlaylistItem[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
    const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}${pageParam}`;
    const data = await httpGet<{
      items: YouTubePlaylistItem[];
      nextPageToken?: string;
    }>(url);

    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * truncateDescription — tronque la description à DESCRIPTION_MAX_LENGTH caractères.
 * Loggue un avertissement si la troncature a eu lieu, pour faciliter le debug.
 */
function truncateDescription(description: string, videoId: string): string {
  if (description.length <= DESCRIPTION_MAX_LENGTH) return description;
  console.warn(
    `[sync-youtube] Description tronquée pour videoId=${videoId} : ` +
    `${description.length} chars → ${DESCRIPTION_MAX_LENGTH} chars`
  );
  return description.slice(0, DESCRIPTION_MAX_LENGTH);
}

// ---------------------------------------------------------------------------
// Upsert logic
// ---------------------------------------------------------------------------

type UpsertResult = "created" | "updated";

async function upsertVideo(
  endpoint: string,
  item: YouTubePlaylistItem
): Promise<UpsertResult> {
  const { snippet } = item;
  const videoId = snippet.resourceId.videoId;
  const thumbnailUrl =
    snippet.thumbnails?.medium?.url ??
    snippet.thumbnails?.default?.url ??
    null;
  const description = truncateDescription(snippet.description ?? "", videoId);

  // Vérifie si la vidéo existe déjà via getContentPost (requête efficace par clé)
  const existing = await appsyncRequest<{
    getContentPost?: { externalId: string; title: string } | null;
  }>(endpoint, GET_CONTENT_POST, { externalId: videoId });

  if (existing?.getContentPost) {
    // Mise à jour complète de tous les champs (titre, description, URL inclus)
    await appsyncRequest(endpoint, UPDATE_CONTENT_POST, {
      input: {
        externalId: videoId,
        title: snippet.title,
        description,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl,
        publishedAt: snippet.publishedAt,
        status: "published",
        rawJson: JSON.stringify(snippet),
      },
    });
    return "updated";
  }

  await appsyncRequest(endpoint, CREATE_CONTENT_POST, {
    input: {
      source: "youtube",
      externalId: videoId,
      title: snippet.title,
      description,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl,
      publishedAt: snippet.publishedAt,
      status: "published",
      rawJson: JSON.stringify(snippet),
    },
  });
  return "created";
}

async function upsertVideos(
  endpoint: string,
  items: YouTubePlaylistItem[]
): Promise<void> {
  console.log(`[sync-youtube] ${items.length} vidéo(s) à synchroniser`);

  // Parallélisation des upserts pour réduire le temps d'exécution Lambda
  const results = await Promise.allSettled(
    items.map((item) => upsertVideo(endpoint, item))
  );

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value === "created") created++;
      else updated++;
    } else {
      failed++;
      console.error("[sync-youtube] Échec upsert :", result.reason);
    }
  }

  console.log(
    `[sync-youtube] Résultat : ${created} créée(s), ${updated} mise(s) à jour, ${failed} échec(s)`
  );

  if (failed > 0) {
    throw new Error(`${failed} vidéo(s) n'ont pas pu être synchronisée(s)`);
  }
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export const handler: Handler = async (event) => {
  console.log("[sync-youtube] Démarrage de la synchronisation YouTube");

  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  const endpoint = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;

  if (!apiKey || !channelId) {
    throw new Error(
      "Variables d'environnement manquantes : YOUTUBE_API_KEY et/ou YOUTUBE_CHANNEL_ID"
    );
  }
  if (!endpoint) {
    throw new Error(
      "Variable d'environnement manquante : AMPLIFY_DATA_GRAPHQL_ENDPOINT"
    );
  }

  try {
    const uploadsPlaylistId = await getUploadsPlaylistId(apiKey, channelId);
    console.log(`[sync-youtube] Playlist uploads : ${uploadsPlaylistId}`);

    const items = await fetchAllPlaylistItems(apiKey, uploadsPlaylistId);
    await upsertVideos(endpoint, items);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Synchronisation réussie : ${items.length} vidéo(s)`,
        count: items.length,
      }),
    };
  } catch (err) {
    console.error("[sync-youtube] ERREUR :", err);
    throw err;
  }
};
