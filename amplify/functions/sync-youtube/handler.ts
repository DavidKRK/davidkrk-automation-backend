/**
 * handler.ts — sync-youtube V1.0
 * ============================================================
 * Synchronise les vidéos YouTube d'une chaîne vers DynamoDB.
 *
 * Flux :
 *   1. channels.list  → récupère l'ID de la playlist «uploads»
 *   2. playlistItems.list (paginé) → liste des vidéos publiées
 *   3. videos.list (par lots de 50) → stats, durée, description
 *   4. Upsert DynamoDB via AppSync GraphQL (idempotent sur externalId)
 *
 * Quota YouTube Data API v3 consommé :
 *   - channels.list  :   1 unité
 *   - playlistItems  :   1 unité × nb_pages (1 page = 50 items)
 *   - videos.list    :   1 unité × nb_lots
 *   Total pour 100 vidéos ≈ 5 unités (très économique)
 * ============================================================
 */

import https from "https";

// ─── Types ────────────────────────────────────────────────────────────────────

interface YoutubeVideoItem {
  externalId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string;
  videoUrl: string;
  viewCount: number;
  likeCount: number;
  duration: string;
  syncedAt: string;
}

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────

function httpGet(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e}`));
          }
        });
      })
      .on("error", reject);
  });
}

// ─── YouTube API helpers ───────────────────────────────────────────────────────

const YT_BASE = "https://www.googleapis.com/youtube/v3";

async function getUploadsPlaylistId(
  apiKey: string,
  channelId: string
): Promise<string> {
  const url = `${YT_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
  const res = (await httpGet(url)) as {
    items?: { contentDetails: { relatedPlaylists: { uploads: string } } }[];
  };
  const playlistId = res.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new Error(`Playlist uploads introuvable pour channelId=${channelId}`);
  return playlistId;
}

async function fetchAllPlaylistItems(
  apiKey: string,
  playlistId: string
): Promise<{ videoId: string; publishedAt: string }[]> {
  const items: { videoId: string; publishedAt: string }[] = [];
  let pageToken = "";

  do {
    const pageParam = pageToken ? `&pageToken=${pageToken}` : "";
    const url = `${YT_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50&key=${apiKey}${pageParam}`;
    const res = (await httpGet(url)) as {
      items?: {
        snippet: {
          resourceId: { videoId: string };
          publishedAt: string;
        };
      }[];
      nextPageToken?: string;
    };

    for (const item of res.items ?? []) {
      items.push({
        videoId: item.snippet.resourceId.videoId,
        publishedAt: item.snippet.publishedAt,
      });
    }
    pageToken = res.nextPageToken ?? "";
  } while (pageToken);

  return items;
}

async function fetchVideoDetails(
  apiKey: string,
  videoIds: string[]
): Promise<
  Record<
    string,
    {
      title: string;
      description: string;
      thumbnailUrl: string;
      viewCount: number;
      likeCount: number;
      duration: string;
    }
  >
> {
  const details: Record<string, ReturnType<typeof fetchVideoDetails> extends Promise<infer T> ? T[string] : never> = {};

  // YouTube accepte 50 IDs max par appel
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50).join(",");
    const url = `${YT_BASE}/videos?part=snippet,contentDetails,statistics&id=${batch}&key=${apiKey}`;
    const res = (await httpGet(url)) as {
      items?: {
        id: string;
        snippet: {
          title: string;
          description: string;
          thumbnails: { high?: { url: string }; default?: { url: string } };
        };
        contentDetails: { duration: string };
        statistics: { viewCount?: string; likeCount?: string };
      }[];
    };

    for (const item of res.items ?? []) {
      details[item.id] = {
        title: item.snippet.title,
        description: (item.snippet.description ?? "").slice(0, 256),
        thumbnailUrl:
          item.snippet.thumbnails?.high?.url ??
          item.snippet.thumbnails?.default?.url ??
          "",
        viewCount: parseInt(item.statistics?.viewCount ?? "0", 10),
        likeCount: parseInt(item.statistics?.likeCount ?? "0", 10),
        duration: item.contentDetails?.duration ?? "",
      };
    }
  }

  return details;
}

// ─── AppSync GraphQL helpers ───────────────────────────────────────────────────

function appsyncRequest(
  endpoint: string,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const url = new URL(endpoint);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`AppSync JSON parse error: ${e}`)); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const LIST_BY_EXTERNAL_ID = /* GraphQL */ `
  query ListByExternalId($externalId: String!) {
    listYoutubeVideos(filter: { externalId: { eq: $externalId } }) {
      items { id externalId }
    }
  }
`;

const CREATE_VIDEO = /* GraphQL */ `
  mutation CreateYoutubeVideo($input: CreateYoutubeVideoInput!) {
    createYoutubeVideo(input: $input) { id externalId }
  }
`;

const UPDATE_VIDEO = /* GraphQL */ `
  mutation UpdateYoutubeVideo($input: UpdateYoutubeVideoInput!) {
    updateYoutubeVideo(input: $input) { id externalId }
  }
`;

async function upsertVideo(
  endpoint: string,
  apiKey: string,
  video: YoutubeVideoItem
): Promise<void> {
  // Cherche si la vidéo existe déjà (idempotent sur externalId)
  const listRes = (await appsyncRequest(endpoint, apiKey, LIST_BY_EXTERNAL_ID, {
    externalId: video.externalId,
  })) as {
    data?: {
      listYoutubeVideos?: { items: { id: string; externalId: string }[] };
    };
  };

  const existing = listRes.data?.listYoutubeVideos?.items?.[0];

  if (existing) {
    // Mise à jour (stats, durée, syncedAt)
    await appsyncRequest(endpoint, apiKey, UPDATE_VIDEO, {
      input: {
        id: existing.id,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        duration: video.duration,
        thumbnailUrl: video.thumbnailUrl,
        syncedAt: video.syncedAt,
      },
    });
  } else {
    // Création
    await appsyncRequest(endpoint, apiKey, CREATE_VIDEO, {
      input: video,
    });
  }
}

// ─── Handler principal ─────────────────────────────────────────────────────────

export const handler = async (): Promise<void> => {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY ?? "";
  const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID ?? "";
  const APPSYNC_ENDPOINT = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT ?? "";
  const APPSYNC_API_KEY = process.env.AMPLIFY_DATA_API_KEY ?? "";

  if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) {
    throw new Error(
      "Variables manquantes : YOUTUBE_API_KEY et YOUTUBE_CHANNEL_ID doivent être configurées dans Amplify Console."
    );
  }
  if (!APPSYNC_ENDPOINT || !APPSYNC_API_KEY) {
    throw new Error(
      "Variables manquantes : AMPLIFY_DATA_GRAPHQL_ENDPOINT et AMPLIFY_DATA_API_KEY sont injectées automatiquement par Amplify Gen 2."
    );
  }

  console.log(`[sync-youtube] Démarrage — channelId=${YOUTUBE_CHANNEL_ID}`);

  // Étape 1 : playlist uploads
  const playlistId = await getUploadsPlaylistId(YOUTUBE_API_KEY, YOUTUBE_CHANNEL_ID);
  console.log(`[sync-youtube] playlistId=${playlistId}`);

  // Étape 2 : liste de toutes les vidéos
  const playlistItems = await fetchAllPlaylistItems(YOUTUBE_API_KEY, playlistId);
  console.log(`[sync-youtube] ${playlistItems.length} vidéos trouvées`);

  // Étape 3 : détails par lots de 50
  const videoIds = playlistItems.map((i) => i.videoId);
  const details = await fetchVideoDetails(YOUTUBE_API_KEY, videoIds);

  // Étape 4 : upsert DynamoDB via AppSync
  const syncedAt = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const item of playlistItems) {
    const d = details[item.videoId];
    if (!d) continue;

    const video: YoutubeVideoItem = {
      externalId: item.videoId,
      title: d.title,
      description: d.description,
      publishedAt: item.publishedAt,
      thumbnailUrl: d.thumbnailUrl,
      videoUrl: `https://youtu.be/${item.videoId}`,
      viewCount: d.viewCount,
      likeCount: d.likeCount,
      duration: d.duration,
      syncedAt,
    };

    await upsertVideo(APPSYNC_ENDPOINT, APPSYNC_API_KEY, video);
    // Comptage simplifié (on considère créé si pas d'erreur)
    created++;
  }

  console.log(
    `[sync-youtube] Terminé — ${created} vidéos traitées, syncedAt=${syncedAt}`
  );
};
