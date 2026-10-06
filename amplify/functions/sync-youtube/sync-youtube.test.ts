import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './handler';

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

  // Étape 2 : Mock de la réponse playlistItems?part=snippet (renvoie 2 vidéos)
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
        { id: 'videoLongue123', contentDetails: { duration: 'PT30M' } },
        { id: 'videoShort456', contentDetails: { duration: 'PT1M20S' } }
      ]
    })
  } as Response);

  // Étape 4 : Fix de la syntaxe de l'objet résolu DynamoDB
  mockSend.mockResolvedValue({ metadata: {} });

  // Exécution du handler
  const result = await handler({}, {} as any);

  // ── ASSERTIONS ──────────────────────────────────────
  expect(globalFetchMock).toHaveBeenCalledTimes(3);
  expect(mockSend).toHaveBeenCalledTimes(2);

  // Extraction propre des arguments envoyés à DynamoDB
  const firstCallInput = mockSend.mock.calls[0][0].input;
  const secondCallInput = mockSend.mock.calls[1][0].input;

  // Validation des URLs calculées par votre logique interne
  expect(firstCallInput.Item.url).toBe('https://youtube.com');
  expect(secondCallInput.Item.url).toBe('https://youtube.com');

  // Vérification de la réponse finale de la Lambda
  expect(result).toEqual({
    statusCode: 200,
    body: '2 vidéos ajoutées.'
  });
});
