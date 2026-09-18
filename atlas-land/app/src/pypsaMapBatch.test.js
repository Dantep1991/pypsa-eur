import { stageMapBatch, assembleMapBatch, groupPypsaFacilities, mapSharedFacilityGroups } from './pypsaMapBatch';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

test('bounded workers preserve input order despite out-of-order responses', async () => {
  const jobs = Array.from({ length: 8 }, deferred);
  const load = jest.fn((index) => jobs[index].promise);
  const result = stageMapBatch(jobs.map((_, index) => index), load);
  expect(load).toHaveBeenCalledTimes(3);
  jobs[2].resolve('third');
  await tick();
  expect(load).toHaveBeenCalledTimes(4);
  jobs.forEach((job, index) => job.resolve(index));
  expect(await result).toEqual([0, 1, 'third', 3, 4, 5, 6, 7]);
});

test('one failed request aborts other work and never returns a partial result', async () => {
  const jobs = Array.from({ length: 8 }, deferred);
  const signals = [];
  const load = jest.fn((index, signal) => { signals.push(signal); return jobs[index].promise; });
  const result = stageMapBatch(jobs.map((_, index) => index), load);
  const rejected = expect(result).rejects.toThrow('France unavailable');
  jobs[1].reject(new Error('France unavailable'));
  await rejected;
  expect(load).toHaveBeenCalledTimes(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  jobs.forEach((job) => job.resolve('late response'));
  await tick();
  expect(load).toHaveBeenCalledTimes(3);
});

test('progress counts completed datasets in completion order, and late cancelled work cannot advance it', async () => {
  const controller = new AbortController();
  const jobs = Array.from({ length: 4 }, deferred);
  const onProgress = jest.fn();
  const batch = stageMapBatch([0, 1, 2, 3], (index) => jobs[index].promise, { signal: controller.signal, onProgress });
  const rejected = expect(batch).rejects.toHaveProperty('name', 'AbortError');
  expect(onProgress).toHaveBeenLastCalledWith({ completed: 0, total: 4 });
  jobs[2].resolve('third');
  await tick();
  expect(onProgress).toHaveBeenLastCalledWith({ completed: 1, total: 4 });
  controller.abort();
  await rejected;
  jobs.forEach((job) => job.resolve('late'));
  await tick();
  expect(onProgress).toHaveBeenCalledTimes(2);
});

test('successful staging reaches its exact total, and already-cancelled staging reports no progress', async () => {
  const onProgress = jest.fn();
  await stageMapBatch(['Grid', 'Supply'], async (value) => value, { onProgress });
  expect(onProgress.mock.calls.map(([value]) => value)).toEqual([
    { completed: 0, total: 2 }, { completed: 1, total: 2 }, { completed: 2, total: 2 },
  ]);
  onProgress.mockClear();
  const controller = new AbortController();
  controller.abort();
  await expect(stageMapBatch([1], async () => 1, { signal: controller.signal, onProgress })).rejects.toHaveProperty('name', 'AbortError');
  expect(onProgress).not.toHaveBeenCalled();
});

test('user cancellation does not wait for a loader that ignores abort', async () => {
  const controller = new AbortController();
  const result = stageMapBatch([1, 2, 3, 4], () => new Promise(() => {}), { signal: controller.signal });
  const rejected = expect(result).rejects.toHaveProperty('name', 'AbortError');
  controller.abort();
  await rejected;
});

test('deadline aborts a stalled batch instead of leaving geography locked', async () => {
  jest.useFakeTimers();
  try {
    const result = stageMapBatch([1, 2, 3, 4], () => new Promise(() => {}), { timeoutMs: 100 });
    const rejected = expect(result).rejects.toThrow('timed out');
    jest.advanceTimersByTime(100);
    await rejected;
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

const stage = (country, level = 'nuts3', scope = 'Grid') => {
  const filename = `base_${country}_${level}.nc`;
  const tags = { sourceCountryCode: country, sourceNetworkFilename: filename };
  return { countryCode: country, countryName: country, filename, domains: { [scope]: true },
    facilities: [{ id: scope === 'Grid' ? 'same-bus-id' : `${scope}-1`, ...tags, latitude: 50, longitude: 4, atlas_domain: scope }],
    connections: scope === 'Grid' ? [{ id: 'same-line-id', from: 'A', to: 'B', s_nom: 1234, ...tags }] : [],
    overlays: [{ name: 'regions.geojson', ...tags, feature_collection: { type: 'FeatureCollection', features: [] } }],
  };
};

test('replacement switches all records together without losing capacity or country-scoped IDs', () => {
  const old = assembleMapBatch([stage('BE', 'nuts1'), stage('FR', 'nuts1')]);
  const snapshot = JSON.stringify(old);
  const next = assembleMapBatch([stage('BE'), stage('FR')], old);
  expect(JSON.stringify(old)).toBe(snapshot);
  expect(next.facilities).toHaveLength(2);
  expect(next.connections).toHaveLength(2);
  expect(next.connections.every((line) => line.s_nom === 1234)).toBe(true);
  expect(next.facilities.every((node) => node.sourceNetworkFilename.endsWith('_nuts3.nc'))).toBe(true);
  expect(Object.keys(next.domains)).toEqual(['base_BE_nuts3.nc', 'base_FR_nuts3.nc']);
});

test('add preserves country order and unaffected records, and replaces changed-country domain metadata', () => {
  const old = assembleMapBatch([stage('BE', 'nuts1'), stage('FR', 'nuts1'), stage('FR', 'nuts1', 'Supply')]);
  const next = assembleMapBatch([stage('FR'), stage('ES')], old, 'add');
  expect(next.networks.map((network) => network.countryCode)).toEqual(['BE', 'FR', 'ES']);
  expect(next.facilities.find((node) => node.sourceCountryCode === 'BE').sourceNetworkFilename).toBe('base_BE_nuts1.nc');
  expect(next.domains['base_FR_nuts1.nc']).toBeUndefined();
  expect(next.domains['base_FR_nuts3.nc']).toEqual({ Grid: true });
  expect(next.facilities.some((node) => node.atlas_domain === 'Supply')).toBe(false);
});

test('visible domains combine at the same location without repeating boundary overlays', () => {
  const next = assembleMapBatch([stage('FR'), stage('FR', 'nuts3', 'Supply'), stage('FR', 'nuts3', 'Demand')]);
  expect(next.facilities).toHaveLength(3);
  expect(next.overlays).toHaveLength(1);
  expect(next.domains['base_FR_nuts3.nc']).toEqual({ Grid: true, Supply: true, Demand: true });
  expect(next.facilities.every((facility) => facility.sameLocationCount === 3)).toBe(true);
  expect(next.facilities[0].sameLocationFacilities).toBe(next.facilities[1].sameLocationFacilities);
});

test('grouping is repeatable without nested/circular copies and keeps real components before virtual ports', () => {
  const grouped = groupPypsaFacilities([
    { id: 'virtual', sourceCountryCode: 'FR', latitude: 50, longitude: 4, is_virtual: true },
    ...stage('FR').facilities,
  ]);
  expect(grouped[0].sameLocationFacilities[0].is_virtual).not.toBe(true);
  expect(groupPypsaFacilities(grouped)).toEqual(grouped);
  expect(() => JSON.stringify(grouped)).not.toThrow();
});

test('regional data-source updates preserve shared groups and every component field', () => {
  const facilities = groupPypsaFacilities(Array.from({ length: 5000 }, (_, index) => ({
    id: `asset-${index}`, latitude: 40 + Math.floor(index / 50) * 0.01, longitude: 3,
    dirname: 'base', p_nom: index, annual_energy_gwh: index / 100,
    demand_breakdown: [{ sector: 'residential', annual_energy_gwh: index / 100 }],
  })));
  const transform = jest.fn(record => ({ ...record, dirname: 'regional-solve' }));
  const updated = mapSharedFacilityGroups(facilities, transform);
  expect(transform).toHaveBeenCalledTimes(10000); // 5,000 top records + 5,000 shared group records, not 255,000.
  expect(new Set(updated.map(record => record.sameLocationFacilities)).size).toBe(100);
  expect(new Set(facilities.map(record => record.sameLocationFacilities)).size).toBe(100);
  for (let index = 0; index < facilities.length; index += 1) {
    expect(updated[index]).toEqual({ ...facilities[index], dirname: 'regional-solve',
      sameLocationFacilities: facilities[index].sameLocationFacilities.map(record => ({ ...record, dirname: 'regional-solve' })) });
    expect(updated[index].demand_breakdown).toBe(facilities[index].demand_breakdown);
    expect(facilities[index].dirname).toBe('base');
  }
});

test('regional updates retain unaffected identities and do not reuse stale transformed groups', () => {
  const facilities = groupPypsaFacilities([
    { id: 'affected', latitude: 50, longitude: 4, dirname: 'base' },
    { id: 'neighbour', latitude: 50, longitude: 4, dirname: 'base' },
    { id: 'unaffected', latitude: 49, longitude: 5, dirname: 'base' },
  ]);
  expect(mapSharedFacilityGroups(facilities, record => record)).toEqual(facilities);
  const update = (dirname) => mapSharedFacilityGroups(facilities, record => record.id === 'affected' ? { ...record, dirname } : record);
  const first = update('first');
  const second = update('second');
  expect(first[2]).toBe(facilities[2]);
  expect(first[2].sameLocationFacilities).toBe(facilities[2].sameLocationFacilities);
  expect(first[0].sameLocationFacilities).toBe(first[1].sameLocationFacilities);
  expect(first[0].sameLocationFacilities.find(record => record.id === 'affected').dirname).toBe('first');
  expect(second[0].sameLocationFacilities.find(record => record.id === 'affected').dirname).toBe('second');
  const solo = { id: 'no-group' };
  expect(mapSharedFacilityGroups([solo], record => record)[0]).toBe(solo);
});

test('incomplete batches cannot replace an existing map', () => {
  expect(() => assembleMapBatch([])).toThrow('No country');
  expect(() => assembleMapBatch([{ countryCode: 'FR' }])).toThrow('Incomplete');
});

test('lazy domain merges preserve hidden components, grid capacity, country order and loaded flags', () => {
  const old = assembleMapBatch([stage('BE'), stage('FR'), stage('BE', 'nuts3', 'Storage')]);
  const original = JSON.stringify(old);
  const next = assembleMapBatch([stage('FR', 'nuts3', 'Supply'), stage('BE', 'nuts3', 'Supply')], old, 'domains');
  expect(JSON.stringify(old)).toBe(original);
  expect(next.networks.map((network) => network.countryCode)).toEqual(['BE', 'FR']);
  expect(next.facilities).toHaveLength(5);
  expect(next.connections).toEqual(old.connections);
  expect(next.overlays).toHaveLength(2);
  expect(next.domains['base_BE_nuts3.nc']).toEqual({ Grid: true, Storage: true, Supply: true });
  expect(next.domains['base_FR_nuts3.nc']).toEqual({ Grid: true, Supply: true });
});

test('asset-only domain merges reuse unchanged topology arrays for map-frame caching', () => {
  const previous = {
    facilities: [{ id: 'bus', sourceCountryCode: 'ES', atlas_domain: 'Grid', latitude: 40, longitude: -3 }],
    connections: [{ id: 'line', sourceCountryCode: 'ES', sourceNetworkFilename: 'es.nc', from: 'a', to: 'b' }],
    overlays: [{ name: 'nuts.geojson', sourceCountryCode: 'ES', sourceNetworkFilename: 'es.nc' }],
    networks: [{ countryCode: 'ES', countryName: 'Spain', filename: 'es.nc' }],
    domains: { 'es.nc': { Grid: true } },
  };
  const next = assembleMapBatch([{
    countryCode: 'ES', countryName: 'Spain', filename: 'es.nc',
    facilities: [{ id: 'solar', sourceCountryCode: 'ES', atlas_domain: 'Supply', latitude: 40, longitude: -3 }],
    connections: [], overlays: [], domains: { Supply: true }, availability: { Supply: true },
  }], previous, 'domains');

  expect(next.connections).toBe(previous.connections);
  expect(next.overlays).toBe(previous.overlays);
  expect(next.facilities).not.toBe(previous.facilities);
});

test('lazy domain merges reject another resolution or a country that has been removed', () => {
  const old = assembleMapBatch([stage('BE')]);
  expect(() => assembleMapBatch([stage('BE', 'nuts2', 'Supply')], old, 'domains')).toThrow('network changed');
  expect(() => assembleMapBatch([stage('FR', 'nuts3', 'Supply')], old, 'domains')).toThrow('network changed');
});
