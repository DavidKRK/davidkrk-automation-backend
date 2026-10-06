import { expect, test, vi, beforeEach } from 'vitest';
import { handler } from './handler';

const vi_mockSend = vi.fn();
vi.mock('@aws-sdk/lib-dynamodb', async (init) => {
  const orig = await init<typeof import('@aws-sdk/lib-dynamodb')>();
  return { ...orig, DynamoDBDocumentClient: { from: () => ({ send: vi_mockSend }) } };
});

process.env.CONTENT_POST_TABLE_NAME = 'TestTable';
process.env.YOUTUBE_API_KEY = 'FakeKey';
process.env.YOUTUBE_CHANNEL_ID = 'FakeChannel';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

test('handler: validation complète', async () => {
  const fetchMock = vi.getMockedFunction(global.fetch);
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'IdPlaylist' } } }] }) } as Response);
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [{ snippet: { title: 'L', resourceId: { videoId: 'v1' } } }] }) } as Response);
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [{ id: 'v1', contentDetails: { duration: 'PT1M' } }] }) } as Response);
  vi_mockSend.mockResolvedValue({ metadata: {} });

  const res = await handler({}, {} as any);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(vi_mockSend).toHaveBeenCalledTimes(1);
  expect(res.statusCode).toBe(200);
});
