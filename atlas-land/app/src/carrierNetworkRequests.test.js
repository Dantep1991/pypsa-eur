import { createCarrierNetworkRequests } from './carrierNetworkRequests';

const network = { facilities: [{ id: 'node' }], connections: [] };
const response = (data = network, ok = true) => ({ ok, json: jest.fn(async () => data) });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

beforeEach(() => jest.useFakeTimers());
afterEach(() => { expect(jest.getTimerCount()).toBe(0); jest.useRealTimers(); });

test('pending ownership spans the body read and clears after cancellation', async () => {
  const body = deferred();
  const client = createCarrierNetworkRequests({ fetchImpl: async () => ({ ok: true, json: () => body.promise }) });
  expect(client.hasPending('gas')).toBe(false);
  const request = client.read('gas', '/network', 'Unavailable').catch(error => error);
  await flush();
  expect(client.hasPending('gas')).toBe(true);
  expect(client.hasPending('water')).toBe(false);
  client.cancel('gas');
  expect((await request).name).toBe('AbortError');
  expect(client.hasPending('gas')).toBe(false);
  body.resolve(network);
  await flush();
  expect(client.hasPending('gas')).toBe(false);
});

test('superseded headers abort immediately and late large bodies are never parsed', async () => {
  const old = deferred();
  const fetchImpl = jest.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response());
  const client = createCarrierNetworkRequests({ fetchImpl });
  const first = client.read('water', '/old', 'Water unavailable').catch((error) => error);
  expect(await client.read('water', '/new', 'Water unavailable')).toEqual(network);
  expect((await first).name).toBe('AbortError');
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  const late = response();
  old.resolve(late);
  await flush();
  expect(late.json).not.toHaveBeenCalled();
});

test('cancelling an old body cannot delete or abort its replacement', async () => {
  const body = deferred();
  const next = deferred();
  const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockReturnValueOnce(next.promise);
  const client = createCarrierNetworkRequests({ fetchImpl });
  const first = client.read('gas', '/old', 'Gas unavailable').catch((error) => error);
  await flush();
  const second = client.read('gas', '/new', 'Gas unavailable').catch((error) => error);
  expect((await first).name).toBe('AbortError');
  body.resolve(network);
  await flush();
  expect(fetchImpl.mock.calls[1][1].signal.aborted).toBe(false);
  client.cancel('gas');
  expect((await second).name).toBe('AbortError');
  expect(fetchImpl.mock.calls[1][1].signal.aborted).toBe(true);
});

test('four carriers share two slots; cancellation removes queued work and stays carrier-scoped', async () => {
  const fetchImpl = jest.fn(() => new Promise(() => {}));
  const client = createCarrierNetworkRequests({ fetchImpl });
  const requests = ['gas', 'water', 'liquids', 'logistics'].map((key) => client.read(key, key, key).catch((error) => error));
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  client.cancel('water');
  expect((await requests[1]).name).toBe('AbortError');
  await flush();
  expect(fetchImpl.mock.calls.map(([, options]) => options.signal.aborted)).toEqual([false, true, false]);
  client.cancelAll();
  expect((await Promise.all(requests)).every((error) => error.name === 'AbortError')).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(3); // The queued logistics request never fetched.
  // StrictMode's cleanup does not permanently disable the client.
  fetchImpl.mockResolvedValueOnce(response());
  expect(await client.read('gas', '/retry', 'Gas unavailable')).toEqual(network);
});

test.each(['headers', 'body'])('timeout includes stalled %s and allows retry', async (phase) => {
  const fetchImpl = jest.fn(() => phase === 'headers'
    ? new Promise(() => {}) : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
  const client = createCarrierNetworkRequests({ fetchImpl, timeoutMs: 100 });
  const result = client.read('water', '/', 'Water unavailable').catch((error) => error);
  await flush();
  jest.advanceTimersByTime(100);
  expect((await result).message).toContain('timed out');
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  fetchImpl.mockResolvedValueOnce(response());
  expect(await client.read('water', '/', 'Water unavailable')).toEqual(network);
});

test('superseding a queued request never fetches its obsolete URL or disturbs the active carrier', async () => {
  const body = deferred();
  const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockResolvedValue(response());
  const client = createCarrierNetworkRequests({ fetchImpl, maxConcurrentNetworks: 1 });
  const gas = client.read('gas', '/gas', 'Gas unavailable');
  await flush();
  const obsolete = client.read('water', '/obsolete', 'Water unavailable').catch(error => error);
  const latest = client.read('water', '/latest', 'Water unavailable');
  expect((await obsolete).name).toBe('AbortError');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
  body.resolve(network);
  await Promise.all([gas, latest]);
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/gas', '/latest']);
});

test('queued timeout removes work without fetching and the client can be reused', async () => {
  const fetchImpl = jest.fn(() => new Promise(() => {}));
  const client = createCarrierNetworkRequests({ fetchImpl, maxConcurrentNetworks: 1, timeoutMs: 100 });
  const first = client.read('gas', '/gas', 'Gas unavailable').catch(error => error);
  const queued = client.read('water', '/water', 'Water unavailable').catch(error => error);
  jest.advanceTimersByTime(100);
  expect((await first).message).toContain('timed out');
  expect((await queued).message).toContain('timed out');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  fetchImpl.mockResolvedValueOnce(response());
  await expect(client.read('water', '/retry', 'Water unavailable')).resolves.toEqual(network);
});

test('status checks bypass busy network slots without starting a queued large download', async () => {
  const body = deferred();
  const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise })
    .mockResolvedValueOnce(response({ available: true, countries: ['FR'] }));
  const client = createCarrierNetworkRequests({ fetchImpl, maxConcurrentNetworks: 1 });
  const active = client.read('gas', '/gas', 'Gas unavailable').catch(error => error);
  const queued = client.read('water', '/water', 'Water unavailable').catch(error => error);
  await expect(client.read('logistics', '/status', 'Logistics unavailable', { kind: 'status' })).resolves.toMatchObject({ available: true });
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/gas', '/status']);
  client.cancelAll();
  expect((await Promise.all([active, queued])).map(error => error.name)).toEqual(['AbortError', 'AbortError']);
  body.resolve(network);
  await flush();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test('a malformed active body releases its slot for the next network', async () => {
  const body = deferred();
  const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: true, json: () => body.promise }).mockResolvedValue(response());
  const client = createCarrierNetworkRequests({ fetchImpl, maxConcurrentNetworks: 1 });
  const first = client.read('gas', '/bad', 'Gas unavailable').catch(error => error);
  const next = client.read('water', '/good', 'Water unavailable');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  body.resolve({});
  expect((await first).message).toContain('invalid network dataset');
  await expect(next).resolves.toEqual(network);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test.each([0, -1, 1.5, Infinity, NaN])('invalid concurrency limit %s is rejected', maxConcurrentNetworks => {
  expect(() => createCarrierNetworkRequests({ maxConcurrentNetworks })).toThrow('positive integer');
});

test.each([null, {}, { facilities: [], connections: null }, []])('invalid dataset %j cannot become a loaded empty map', async (payload) => {
  const client = createCarrierNetworkRequests({ fetchImpl: async () => response(payload) });
  await expect(client.read('gas', '/', 'Gas unavailable')).rejects.toThrow('invalid network dataset');
});

test('valid empty maps, HTTP errors and JSON failures remain distinct', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce(response({ facilities: [], connections: [] }))
    .mockResolvedValueOnce(response({ error: 'Source unavailable' }, false))
    .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } });
  const client = createCarrierNetworkRequests({ fetchImpl });
  await expect(client.read('gas', '/', 'Gas unavailable')).resolves.toEqual({ facilities: [], connections: [] });
  await expect(client.read('gas', '/', 'Gas unavailable')).rejects.toThrow('Source unavailable');
  await expect(client.read('gas', '/', 'Gas unavailable')).rejects.toThrow('Invalid JSON');
});

test('status and network share cancellation ownership and status has a shorter deadline', async () => {
  const fetchImpl = jest.fn(() => new Promise(() => {}));
  const client = createCarrierNetworkRequests({ fetchImpl });
  const old = client.read('gas', '/status', 'Gas unavailable', { kind: 'status' }).catch((error) => error);
  const current = client.read('gas', '/network', 'Gas unavailable').catch((error) => error);
  expect((await old).name).toBe('AbortError');
  client.cancelAll();
  await current;
  const status = client.read('gas', '/status', 'Gas unavailable', { kind: 'status' }).catch((error) => error);
  jest.advanceTimersByTime(30_000);
  expect((await status).message).toContain('timed out');
  fetchImpl.mockResolvedValueOnce(response({ available: true, countries: ['BE'] }));
  await expect(client.read('gas', '/status', 'Gas unavailable', { kind: 'status' })).resolves.toMatchObject({ available: true });
});

test.each([{}, { available: true }, { available: 'true', countries: [] }, { available: true, countries: {} }])('malformed status %j is not a usable source', async (payload) => {
  const client = createCarrierNetworkRequests({ fetchImpl: async () => response(payload) });
  await expect(client.read('gas', '/status', 'Gas unavailable', { kind: 'status' })).rejects.toThrow('invalid network dataset');
});

test('an HTTP-200 unavailable source remains an error rather than a healthy empty network', async () => {
  const client = createCarrierNetworkRequests({ fetchImpl: async () => response({ available: false, error: 'Database missing' }) });
  await expect(client.read('gas', '/status', 'Gas unavailable', { kind: 'status' })).rejects.toThrow('Database missing');
});
