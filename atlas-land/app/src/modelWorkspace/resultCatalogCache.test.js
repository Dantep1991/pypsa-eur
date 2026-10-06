import { cachedResultCatalog } from './resultCatalogCache';

test('completed catalogues reuse memory and explicit refresh reads anew', async () => {
  const fetchImpl = jest.fn(), load = jest.fn(async () => ({ runs: [1] }));
  const first = await cachedResultCatalog(fetchImpl, 'a', {}, load);
  const onProgress = jest.fn();
  expect(await cachedResultCatalog(fetchImpl, 'a', { onProgress }, load)).toBe(first);
  expect(load).toHaveBeenCalledTimes(1);
  expect(onProgress).toHaveBeenCalledWith({ phase: 'cached', completed: 1, total: 1 });
  await cachedResultCatalog(fetchImpl, 'a', { refresh: true }, load);
  await cachedResultCatalog(fetchImpl, 'b', {}, load);
  expect(load).toHaveBeenCalledTimes(3);
});

test('cancelled and failed reads are not cached, and entries expire', async () => {
  const fetchImpl = jest.fn(), controller = new AbortController();
  const cancelled = jest.fn(async () => { controller.abort(); return { runs: [] }; });
  await expect(cachedResultCatalog(fetchImpl, 'a', { signal: controller.signal }, cancelled)).rejects.toMatchObject({ name: 'AbortError' });
  const failed = jest.fn(async () => { throw new Error('missing'); });
  await expect(cachedResultCatalog(fetchImpl, 'a', {}, failed)).rejects.toThrow('missing');
  const load = jest.fn(async () => ({ runs: [] }));
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1);
  await cachedResultCatalog(fetchImpl, 'a', {}, load);
  clock.mockReturnValue(31 * 60 * 1000);
  await cachedResultCatalog(fetchImpl, 'a', {}, load);
  expect(load).toHaveBeenCalledTimes(2);
  clock.mockRestore();
});
