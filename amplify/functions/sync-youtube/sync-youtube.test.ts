import { expect, test, vi } from 'vitest';

// 1. Simulation (Mock) de l'API YouTube / Google Client
const mockListVideos = vi.fn();
vi.mock('googleapis', () => ({
  google: {
    youtube: () => ({
      playlistItems: {
        list: mockListVideos
      }
    })
  }
}));

// 2. Simulation des variables d'environnement requises
process.env.YOUTUBE_CHANNEL_ID = 'UC1234567890';
process.env.YOUTUBE_API_KEY = 'AIzaSyFakeKey';

test('sync-youtube: devrait récupérer les vidéos de la chaîne avec succès', async () => {
  // Configurer une fausse réponse de l'API YouTube
  mockListVideos.mockResolvedValue({
    data: {
      items: [
        { snippet: { title: 'Mon super live DavidKRK', resourceId: { videoId: 'abc123XYZ' } } }
      ]
    }
  });

  // Simulation d'une exécution de la Lambda
  const response = await mockListVideos({
    part: ['snippet'],
    playlistId: 'UU' + process.env.YOUTUBE_CHANNEL_ID
  });

  // Vérifications (Assertions)
  expect(response.data.items).toHaveLength(1);
  expect(response.data.items[0].snippet.title).toBe('Mon super live DavidKRK');
  expect(mockListVideos).toHaveBeenCalledTimes(1);
});
