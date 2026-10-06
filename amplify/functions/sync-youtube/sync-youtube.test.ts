import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './handler';

// 1. Déclaration avec le préfixe strict 'vi' exigé pour le hoisting de Vitest
const vi_mockSend = vi.fn();
vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
  return {
    ...original,
    DynamoDBDocumentClient: {
      from: () => ({
        send: vi_mockSend,
      }),
    },
  };
});

// 2. Configuration des variables d'environnement
process.env.CONTENT_POST_TABLE_NAME = 'TestContentPostTable';
process.env.YOUTUBE_API_KEY = 'AIzaSyFakeKey_123';
process.env.YOUTUBE_CHANNEL_ID = 'UC_DavidKRK_ChannelID';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

test('handler: devrait exécuter le flux complet, détecter les Shorts et insérer dans DynamoDB', async () => {
  const globalFetchMock = vi.getMockedFunction(global.fetch);

  // Étape 1 : Mock de la réponse channels
  globalFetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU_DavidKRK_Uploads' } } }]
    })
  } as Response);

  // Étape 2 : Mock de la réponse playlistItems
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

  // Étape 3 : Mock de la réponse videos (Durées ISO 8601 : PT30M et PT1M20S)
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

  // Étape 4 : Validation du comportement DynamoDB
  vi_mockSend.mockResolvedValue({ metadata: {} });

  // Exécution du handler
  const result = await handler({}, {} as any);

  // Assertions de validation
  expect(globalFetchMock).toHaveBeenCalledTimes(3);
  expect(vi_mockSend).toHaveBeenCalledTimes(2);

  // Validation de la structure finale
  expect(result).toEqual({
    statusCode: 200,
    body: '2 vidéos ajoutées.'
  });
});
