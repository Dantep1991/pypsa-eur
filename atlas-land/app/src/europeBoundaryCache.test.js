import { loadEuropeBoundaries, resetEuropeBoundaryCache } from './europeBoundaryCache';

beforeEach(resetEuropeBoundaryCache);

test('deduplicates concurrent requests and reuses the parsed boundary object', async () => {
  const data = { type: 'FeatureCollection', features: [{ id: 'FR' }] };
  const fetcher = jest.fn(async () => ({ ok: true, json: async () => data }));
  const first = loadEuropeBoundaries({ url: '/atlas/europe.geojson', fetcher });
  const second = loadEuropeBoundaries({ url: '/atlas/europe.geojson', fetcher });
  expect(first).toBe(second);
  expect(await first).toBe(data);
  expect(await loadEuropeBoundaries({ url: '/atlas/europe.geojson', fetcher })).toBe(data);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/atlas/europe.geojson', { cache: 'force-cache' });
});

test('does not retain an invalid or failed response', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ type: 'FeatureCollection' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  await expect(loadEuropeBoundaries({ url: '/atlas/europe.geojson', fetcher })).rejects.toThrow('GeoJSON FeatureCollection');
  await expect(loadEuropeBoundaries({ url: '/atlas/europe.geojson', fetcher })).resolves.toMatchObject({ features: [] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('separates caches for distinct asset mounts', async () => {
  const fetcher = jest.fn(async (url) => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ id: url }] }) }));
  expect((await loadEuropeBoundaries({ url: '/atlas/europe.geojson', fetcher })).features[0].id).toBe('/atlas/europe.geojson');
  expect((await loadEuropeBoundaries({ url: '/canary/europe.geojson', fetcher })).features[0].id).toBe('/canary/europe.geojson');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('a slower old mount cannot replace a newer cache entry', async () => {
  let releaseOld;
  const oldResponse = new Promise((resolve) => { releaseOld = resolve; });
  const fetcher = jest.fn((url) => url.startsWith('/old')
    ? oldResponse
    : Promise.resolve({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ id: 'new' }] }) }));

  const oldRequest = loadEuropeBoundaries({ url: '/old/europe.geojson', fetcher });
  expect((await loadEuropeBoundaries({ url: '/new/europe.geojson', fetcher })).features[0].id).toBe('new');
  releaseOld({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [{ id: 'old' }] }) });
  expect((await oldRequest).features[0].id).toBe('old');
  expect((await loadEuropeBoundaries({ url: '/new/europe.geojson', fetcher })).features[0].id).toBe('new');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
