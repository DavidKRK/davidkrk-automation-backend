import type { Handler } from "aws-lambda";

/**
 * Handler principal de la fonction sync-youtube.
 *
 * Logique V1.0 :
 *  1. Récupère l'ID de la playlist "uploads" de la chaîne via channels.list
 *  2. Lit les vidéos via playlistItems.list (max 50 par page, pagination complète)
 *  3. Pour chaque vidéo, upsert un ContentPost dans DynamoDB via l'API Amplify
 *
 * Pourquoi playlistItems et pas search.list ?
 *   → search.list coûte 100 unités de quota par appel (très cher)
 *   → playlistItems.list coûte seulement 1 unité — beaucoup plus économique
 */

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubePlaylistItem {
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    resourceId: { videoId: string };
    thumbnails: { medium?: { url: string }; default?: { url: string } };
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Étape 1 — Récupérer l'ID de la playlist "uploads" de la chaîne
 */
async function getUploadsPlaylistId(
  apiKey: string,
  channelId: string
): Promise<string> {
  const url = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const data = await fetchJson<{
    items: Array<{ contentDetails: { relatedPlaylists: { uploads: string } } }>;
  }>(url);

  if (!data.items?.length) {
    throw new Error(`Chaîne YouTube introuvable : ${channelId}`);
  }
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

/**
 * Étape 2 — Lire toutes les vidéos de la playlist uploads (avec pagination)
 */
async function fetchAllPlaylistItems(
  apiKey: string,
  playlistId: string
): Promise<YouTubePlaylistItem[]> {
  const items: YouTubePlaylistItem[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
    const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}${pageParam}`;
    const data = await fetchJson<{
      items: YouTubePlaylistItem[];
      nextPageToken?: string;
    }>(url);

    items.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Étape 3 — Upsert chaque vidéo dans ContentPost via l'API Amplify Data
 *
 * NOTE : En production, remplacer l'accès direct DynamoDB par le client
 * Amplify Data (generateClient) avec les credentials Lambda appropriés.
 * Pour la V1.0, le JSON est loggué pour validation avant connexion DB.
 */
async function upsertVideos(items: YouTubePlaylistItem[]): Promise<void> {
  console.log(`[sync-youtube] ${items.length} vidéo(s) à synchroniser`);

  for (const item of items) {
    const { snippet } = item;
    const videoId = snippet.resourceId.videoId;
    const thumbnailUrl =
      snippet.thumbnails?.medium?.url ??
      snippet.thumbnails?.default?.url ??
      null;

    const post = {
      source: "youtube",
      externalId: videoId,
      title: snippet.title,
      description: snippet.description?.slice(0, 500) ?? "",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl,
      publishedAt: snippet.publishedAt,
      status: "published",
      rawJson: JSON.stringify(snippet),
    };

    // TODO V1.1 : remplacer ce log par un vrai upsert Amplify Data
    // await amplifyDataClient.models.ContentPost.create(post);
    console.log("[sync-youtube] video prête :", JSON.stringify(post));
  }
}

/**
 * Handler principal Lambda
 */
export const handler: Handler = async (event) => {
  console.log("[sync-youtube] Démarrage de la synchronisation YouTube");

  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  if (!apiKey || !channelId) {
    throw new Error(
      "Variables d'environnement manquantes : YOUTUBE_API_KEY et/ou YOUTUBE_CHANNEL_ID"
    );
  }

  try {
    // 1. Playlist uploads
    const uploadsPlaylistId = await getUploadsPlaylistId(apiKey, channelId);
    console.log(`[sync-youtube] Playlist uploads : ${uploadsPlaylistId}`);

    // 2. Toutes les vidéos
    const items = await fetchAllPlaylistItems(apiKey, uploadsPlaylistId);

    // 3. Upsert
    await upsertVideos(items);

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
