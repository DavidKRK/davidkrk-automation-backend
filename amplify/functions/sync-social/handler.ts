import type { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

type SupportedSource = "instagram" | "twitch" | "tiktok";

interface NormalizedPost {
  source: SupportedSource;
  externalId: string;
  title: string;
  url: string;
  publishedAt: string;
  thumbnailUrl?: string;
  description?: string;
  rawJson?: string;
}

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_RAW_JSON_LENGTH = 5000;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function truncate(value: string | undefined, maxLength: number): string {
  if (!value) return "";
  return value.length > maxLength ? value.substring(0, maxLength) : value;
}

function toIsoDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function asRawJson(input: unknown): string {
  return truncate(JSON.stringify(input ?? {}), MAX_RAW_JSON_LENGTH);
}

async function savePosts(
  tableName: string,
  posts: NormalizedPost[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const post of posts) {
    try {
      await dynamo.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            source: post.source,
            externalId: post.externalId,
            title: truncate(post.title, 200) || "Sans titre",
            url: post.url,
            publishedAt: post.publishedAt,
            thumbnailUrl: post.thumbnailUrl ?? "",
            description: truncate(post.description, MAX_DESCRIPTION_LENGTH),
            status: "published",
            rawJson: post.rawJson ?? "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            __typename: "ContentPost",
          },
          ConditionExpression: "attribute_not_exists(source)",
        })
      );
      created += 1;
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        err.name === "ConditionalCheckFailedException"
      ) {
        skipped += 1;
        continue;
      }
      throw err;
    }
  }

  return { created, skipped };
}

async function syncInstagram(limit = 20): Promise<NormalizedPost[]> {
  const token = getEnv("INSTAGRAM_ACCESS_TOKEN");
  if (!token) {
    console.log("[sync-social][instagram] Variable manquante: INSTAGRAM_ACCESS_TOKEN. Source ignoree.");
    return [];
  }

  const params = new URLSearchParams({
    fields: "id,caption,media_url,permalink,timestamp,thumbnail_url,media_type",
    limit: String(Math.min(limit, 50)),
    access_token: token,
  });

  const response = await fetch(`https://graph.instagram.com/me/media?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Instagram API HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: Array<{
      id?: string;
      caption?: string;
      media_url?: string;
      permalink?: string;
      timestamp?: string;
      thumbnail_url?: string;
    }>;
  };

  return (data.data ?? [])
    .filter((item) => Boolean(item.id && item.permalink))
    .map((item) => ({
      source: "instagram" as const,
      externalId: item.id as string,
      title: item.caption?.split("\n")[0] ?? `Post Instagram ${item.id}`,
      url: item.permalink as string,
      publishedAt: toIsoDate(item.timestamp),
      thumbnailUrl: item.thumbnail_url ?? item.media_url,
      description: item.caption,
      rawJson: asRawJson(item),
    }));
}

async function getTwitchAppAccessToken(): Promise<string | undefined> {
  const clientId = getEnv("TWITCH_CLIENT_ID");
  const clientSecret = getEnv("TWITCH_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    console.log(
      "[sync-social][twitch] Variables manquantes: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET. Source ignoree."
    );
    return undefined;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Twitch OAuth HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { access_token?: string };
  return payload.access_token;
}

async function syncTwitch(limit = 20): Promise<NormalizedPost[]> {
  const userId = getEnv("TWITCH_USER_ID");
  if (!userId) {
    console.log("[sync-social][twitch] Variable manquante: TWITCH_USER_ID. Source ignoree.");
    return [];
  }

  const token = await getTwitchAppAccessToken();
  const clientId = getEnv("TWITCH_CLIENT_ID");
  if (!token || !clientId) {
    return [];
  }

  const params = new URLSearchParams({
    user_id: userId,
    first: String(Math.min(limit, 100)),
    type: "archive",
  });

  const response = await fetch(`https://api.twitch.tv/helix/videos?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
    },
  });

  if (!response.ok) {
    throw new Error(`Twitch Helix HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: Array<{
      id?: string;
      title?: string;
      description?: string;
      url?: string;
      published_at?: string;
      thumbnail_url?: string;
    }>;
  };

  return (data.data ?? [])
    .filter((item) => Boolean(item.id && item.url))
    .map((item) => ({
      source: "twitch" as const,
      externalId: item.id as string,
      title: item.title ?? `VOD Twitch ${item.id}`,
      url: item.url as string,
      publishedAt: toIsoDate(item.published_at),
      thumbnailUrl: item.thumbnail_url,
      description: item.description,
      rawJson: asRawJson(item),
    }));
}

async function syncTiktok(limit = 20): Promise<NormalizedPost[]> {
  const accessToken = getEnv("TIKTOK_ACCESS_TOKEN");
  if (!accessToken) {
    console.log("[sync-social][tiktok] Variable manquante: TIKTOK_ACCESS_TOKEN. Source ignoree.");
    return [];
  }

  const fields = [
    "id",
    "title",
    "video_description",
    "share_url",
    "cover_image_url",
    "create_time",
  ].join(",");

  const response = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      max_count: Math.min(limit, 20),
    }),
  });

  if (!response.ok) {
    throw new Error(`TikTok API HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: {
      videos?: Array<{
        id?: string;
        title?: string;
        video_description?: string;
        share_url?: string;
        cover_image_url?: string;
        create_time?: number;
      }>;
    };
  };

  return (data.data?.videos ?? [])
    .filter((item) => Boolean(item.id && item.share_url))
    .map((item) => ({
      source: "tiktok" as const,
      externalId: item.id as string,
      title: item.title ?? `Video TikTok ${item.id}`,
      url: item.share_url as string,
      publishedAt: item.create_time
        ? new Date(item.create_time * 1000).toISOString()
        : new Date().toISOString(),
      thumbnailUrl: item.cover_image_url,
      description: item.video_description,
      rawJson: asRawJson(item),
    }));
}

export const handler: Handler = async () => {
  const tableName = getEnv("CONTENT_POST_TABLE_NAME");
  if (!tableName) {
    throw new Error("Missing required environment variable: CONTENT_POST_TABLE_NAME");
  }

  const limit = Number(getEnv("SOCIAL_SYNC_LIMIT") ?? "20");
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;

  const fetchers: Array<{ name: SupportedSource; fn: () => Promise<NormalizedPost[]> }> = [
    { name: "instagram", fn: () => syncInstagram(normalizedLimit) },
    { name: "twitch", fn: () => syncTwitch(normalizedLimit) },
    { name: "tiktok", fn: () => syncTiktok(normalizedLimit) },
  ];

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const fetcher of fetchers) {
    try {
      const posts = await fetcher.fn();
      const validPosts = posts.filter((post) => post.externalId && post.url);
      if (validPosts.length === 0) {
        console.log(`[sync-social][${fetcher.name}] Aucun contenu a synchroniser.`);
        continue;
      }

      const result = await savePosts(tableName, validPosts);
      totalCreated += result.created;
      totalSkipped += result.skipped;

      console.log(
        `[sync-social][${fetcher.name}] ${result.created} cree(s), ${result.skipped} deja present(s).`
      );
    } catch (error) {
      console.error(`[sync-social][${fetcher.name}] Echec de synchronisation:`, error);
    }
  }

  console.log(`[sync-social] Termine - ${totalCreated} cree(s), ${totalSkipped} ignore(s).`);

  return {
    statusCode: 200,
    body: JSON.stringify({
      created: totalCreated,
      skipped: totalSkipped,
    }),
  };
};
