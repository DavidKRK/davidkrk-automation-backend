import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './handler';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// 1. Simulation globale de DynamoDB Document Client
const mockSend = vi.fn();
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
  return {
    ...original,
    DynamoDBDocumentClient: {
      from: () => ({
        send: mockSend,
      }),
    },
  };
});

// 2. Configuration des variables d'environnement fictives nécessaires au handler
process.env.CONTENT_POST_TABLE_NAME = 'TestContentPostTable';
process.env.YOUTUBE_API_KEY = 'AIzaSyFakeKey_123';
process.env.YOUTUBE_CHANNEL_ID = 'UC_DavidKRK_ChannelID';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

test('handler: devrait exécuter le flux complet, détecter les Shorts et insérer dans DynamoDB', async () => {
  const globalFetchMock = vi.getMockedFunction(global.fetch);

  // Étape 1 : Mock de la réponse channels?part=contentDetails
  globalFetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU_DavidKRK_Uploads' } } }]
    })
  } as Response);

  // Étape 2 : Mock de la réponse playlistItems?part=snippet (renvoie 2 vidéos : 1 classique et 1 Short potentiel)
  globalFetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        {
          snippet: {
            title: 'Vidéo Classique Longue',
            description: 'Petite description',
            publishedAt: '2026-10-06T12:00:00Z',
            resourceId: { videoId: 'videoLongue123' },
            thumbnails: { default: { url: 'https://img.yt' } }
          }
        },
        {
          snippet: {
            title: 'Vidéo Format Court',
            description: 'Ceci est un Short',
            publishedAt: '2026-10-06T12:05:00Z',
            resourceId: { videoId: 'videoShort456' },
            thumbnails: { default: { url: 'https://img.yt' } }
          }
        }
      ]
    })
  } as Response);

  // Étape 3 : Mock de la réponse videos?part=contentDetails (Durées ISO 8601 : PT30M et PT1M20S)
  globalFetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        { id: 'videoLongue123', contentDetails: { duration: 'PT30M' } },    // 1800s (> 180s) -> Vidéo classique
        { id: 'videoShort456', contentDetails: { duration: 'PT1M20S' } }    // 80s (<= 180s) -> YouTube Short
      ]
    })
  } as Response);

  // Étape 4 : Mock du comportement d'insertion DynamoDB (.send)
  mockSend.mockResolvedValue({ : {} });

  // Exécution du handler dans l'environnement Vitest
  const result = await handler({}, {} as any);

  // ── ASSERTIONS ET VÉRIFICATIONS ──────────────────────────────────────
  
  // Vérifie que les 3 requêtes HTTP YouTube API v3 ont bien été appelées
  expect(globalFetchMock).toHaveBeenCalledTimes(3);

  // Vérifie l'URL de l'API Channels
  expect(globalFetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/channels?part=contentDetails'));

  // Vérifie que DynamoDB a reçu les requêtes d'insertion PutCommand
  expect(mockSend).toHaveBeenCalledTimes(2);

  // Vérification de l'idempotence et du formatage des URLs spécifiques (Watch vs Shorts)
  const firstInsertedItem = mockSend.mock.calls[0][0].input.Item;
  const secondInsertedItem = mockSend.mock.calls[1][0].input.Item;

  // L'item 1 doit être une vidéo classique
  expect(firstInsertedItem.url).toBe('https://youtube.com');
  expect(firstInsertedItem.__typename).toBe('ContentPost');

  // L'item 2 doit être correctement identifié comme un YouTube Short (durée <= 180s)
  expect(secondInsertedItem.url).toBe('https://youtube.com');

  // Vérification de la réponse finale de la Lambda
  expect(result).toEqual({
    statusCode: 200,
    body: '2 vidéos ajoutées.'
  });
});
