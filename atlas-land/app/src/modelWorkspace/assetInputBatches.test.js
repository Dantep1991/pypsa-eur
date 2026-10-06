import { forEachAssetInputBatch, clearAssetInputBatchCache } from './assetInputBatches';
import { readAssetApi } from './modelAssets';

const objects = Array.from({ length: 123 }, (_, id) => ({ id: `object:${id}` }));
const binding = { project_id: 'P', model_version: 'v1' };
const options = { projectId: 'P', version: 'v1', className: 'Generator', propertyName: 'Capacity', objects,
  inputDate: '2030-01-01', scenario: 'Selected', apiBase: '/atlas-api', onBatch: jest.fn() };
const response = payload => ({ ok: true, json: async () => payload });
const api = override => jest.fn(async url => {
  const ids = JSON.parse(new URL(url, 'http://atlas').searchParams.get('object_ids'));
  const payload = { ...binding, class_name: 'Generator', property_name: 'Capacity',
    resolution_contract: 'nohm.modelling.input-snapshot.v1', objects: ids.map(id => ({ id })) };
  return response(override ? override(payload) : payload);
});
beforeEach(() => { options.onBatch.mockClear(); clearAssetInputBatchCache(); });
afterEach(() => jest.useRealTimers());

test('uses exact sequential 50-object batches, with original binding, date, scenario and progress', async () => {
  const fetch = api();
  await forEachAssetInputBatch(options, fetch);
  expect(fetch.mock.calls).toHaveLength(3);
  expect(options.onBatch.mock.calls.map(([, progress]) => progress)).toEqual([
    { completed: 50, total: 123 }, { completed: 100, total: 123 }, { completed: 123, total: 123 },
  ]);
  const requested = fetch.mock.calls.flatMap(([url]) => {
    expect(url).toContain('/atlas-api/api/atlas/projects/P/assets/inputs?');
    const params = new URL(url, 'http://atlas').searchParams;
    expect(params.get('input_date')).toBe('2030-01-01');
    expect(params.get('scenario')).toBe('Selected');
    return JSON.parse(params.get('object_ids'));
  });
  expect(requested).toEqual(objects.map(obj => obj.id));
});

test.each(['project', 'version', 'class', 'property', 'duplicate', 'missing', 'unexpected'])('rejects %s response before publishing its batch', async kind => {
  const fetch = api(payload => {
    if (kind === 'project') return { ...payload, project_id: 'Other' };
    if (kind === 'version') return { ...payload, model_version: 'Other' };
    if (kind === 'class') return { ...payload, class_name: 'Other' };
    if (kind === 'property') return { ...payload, property_name: 'Other' };
    if (kind === 'missing') return { ...payload, objects: payload.objects.slice(1) };
    if (kind === 'duplicate') return { ...payload, objects: payload.objects.map(() => payload.objects[0]) };
    return { ...payload, objects: [{ id: 'outside-batch' }] };
  });
  await expect(forEachAssetInputBatch(options, fetch)).rejects.toThrow();
  expect(options.onBatch).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('selection cancellation stops further batches even if transport returns late', async () => {
  const controller = new AbortController();
  const onBatch = jest.fn(() => controller.abort());
  const fetch = api();
  await expect(forEachAssetInputBatch({ ...options, signal: controller.signal, onBatch }, fetch))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('empty selection performs no input query', async () => {
  const fetch = api();
  await forEachAssetInputBatch({ ...options, objects: [] }, fetch);
  expect(fetch).not.toHaveBeenCalled();
});

test('cached snapshots expire from their original read, not from the last reuse', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const fetch = api();
    await forEachAssetInputBatch({ ...options, reuse: true }, fetch);
    clock.mockReturnValue(20000);
    await forEachAssetInputBatch({ ...options, reuse: true }, fetch);
    expect(fetch).toHaveBeenCalledTimes(3);
    clock.mockReturnValue(32000);
    await forEachAssetInputBatch({ ...options, reuse: true }, fetch);
    expect(fetch).toHaveBeenCalledTimes(6);
  } finally { clock.mockRestore(); }
});

test.each(['inputDate', 'scenario', 'apiBase', 'version', 'projectId', 'propertyName'])('does not share cached snapshots across %s selections', async field => {
  const fetch = jest.fn(async url => {
    const parsed = new URL(url, 'http://atlas'), params = parsed.searchParams;
    return response({ project_id: parsed.pathname.includes('/projects/Other/') ? 'Other' : 'P',
      model_version: params.get('version'), class_name: params.get('class_name'),
      property_name: params.get('property_name'), resolution_contract: 'nohm.modelling.input-snapshot.v1',
      objects: JSON.parse(params.get('object_ids')).map(id => ({ id })) });
  });
  await forEachAssetInputBatch({ ...options, reuse: true }, fetch);
  await forEachAssetInputBatch({ ...options, reuse: true, [field]: field === 'apiBase' ? '/Other' : 'Other' }, fetch);
  expect(fetch).toHaveBeenCalledTimes(6);
});

test('parallel loading stays bounded and publishes complete batches in source order', async () => {
  let active = 0, highest = 0;
  const pending = [];
  const base = api();
  const fetch = jest.fn((...args) => {
    active += 1; highest = Math.max(highest, active);
    return new Promise(resolve => pending.push(async () => { active -= 1; resolve(await base(...args)); }));
  });
  const loading = forEachAssetInputBatch({ ...options, concurrency: 4 }, fetch);
  expect(highest).toBe(3);
  expect(options.onBatch).not.toHaveBeenCalled();
  for (const finish of [...pending].reverse()) await finish();
  await loading;
  expect(options.onBatch.mock.calls.map(([, progress]) => progress.completed)).toEqual([50, 100, 123]);
});

test('an aborted response is not reused by a later read', async () => {
  const controller = new AbortController();
  const cancelled = api(payload => { controller.abort(); return payload; });
  await expect(forEachAssetInputBatch({ ...options, reuse: true, signal: controller.signal }, cancelled))
    .rejects.toMatchObject({ name: 'AbortError' });
  const retry = api();
  await forEachAssetInputBatch({ ...options, reuse: true }, retry);
  expect(retry).toHaveBeenCalledTimes(3);
});

const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

test.each(['fetch', 'body'])('timeout includes stalled %s, aborts transport and never publishes partial data', async phase => {
  jest.useFakeTimers();
  let signal;
  const fetch = jest.fn((_url, opts) => {
    signal = opts.signal;
    return phase === 'fetch' ? new Promise(() => {}) : Promise.resolve({ ok: true, json: () => new Promise(() => {}) });
  });
  const assertion = expect(forEachAssetInputBatch({ ...options, timeoutMs: 20 }, fetch)).rejects.toThrow('timed out');
  // Every attempt stalls: the first read and both retries time out before the batch fails.
  for (let attempt = 0; attempt < 3; attempt += 1) { jest.advanceTimersByTime(20); await settle(); }
  await assertion;
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(signal.aborted).toBe(true);
  expect(options.onBatch).not.toHaveBeenCalled();
});

// Dante's dry run, 5 Oct: one cold Supply batch outlasted the timeout and the whole overlay failed.
test('a batch that times out once is read again and published', async () => {
  jest.useFakeTimers();
  const base = api();
  const fetch = jest.fn((...args) => (fetch.mock.calls.length === 1 ? new Promise(() => {}) : base(...args)));
  const loading = forEachAssetInputBatch({ ...options, timeoutMs: 20 }, fetch);
  jest.advanceTimersByTime(20);
  await settle();
  jest.useRealTimers();
  await loading;
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(options.onBatch.mock.calls.map(([, progress]) => progress.completed)).toEqual([50, 100, 123]);
});

test('a service error is not retried, even one that mentions a timeout', async () => {
  const fetch = jest.fn(async () => ({ ok: false, status: 504, json: async () => ({ detail: 'Snapshot timed out' }) }));
  await expect(forEachAssetInputBatch(options, fetch)).rejects.toThrow('Snapshot timed out');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('no retry starts once it could not finish inside the shared budget', async () => {
  jest.useFakeTimers();
  const fetch = jest.fn(() => new Promise(() => {}));
  const assertion = expect(forEachAssetInputBatch({ ...options, timeoutMs: 20, retryUntil: Date.now() + 30 }, fetch))
    .rejects.toMatchObject({ name: 'TimeoutError' });
  jest.advanceTimersByTime(20);
  await settle();
  await assertion;
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('caller cancellation is immediate without requiring a cooperating transport', async () => {
  const controller = new AbortController();
  const assertion = expect(readAssetApi('/test', { signal: controller.signal }, () => new Promise(() => {})))
    .rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await assertion;
});
