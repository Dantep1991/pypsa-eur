import { inputAssetValues, assetOutputSeries, modelAssetFrame, validateAssetBinding, validateAssetWindow, fetchAssetOutputsCatalog } from './modelAssets';

const objects = [{ id: 'g', class_name: 'Generator', name: 'G', nodes: [
  { id: 'a', name: 'A', position: { lat: 50, lon: 4 } }, { id: 'b', name: 'B', position: { lat: 51, lon: 5 } }], properties: [] }];
const selection = { runId: 'native:x', modelVersion: 'v1', className: 'Generator', propertyName: 'Generation' };
const payload = { project_id: 'P', runs: [{ run_id: 'native:x', schema_version_id: 'v1' }], rows: [
  { run_id: 'native:x', class_name: 'Generator', property_name: 'Generation', entity_name: 'G', time_bucket: '2050-01-01', value: 0, unit_name: 'MW' }] };

test('zero is a real input; missing or dynamic rows never become a fabricated zero', () => {
  const mapped = inputAssetValues({ objects: [
    { id: 'zero', records: [{ Value: '0', Units: 'MW' }] }, { id: 'missing', records: [] },
    { id: 'file', records: [{ Value: '0', Data_x0020_File: 'Data' }] },
    { id: 'scenario', records: [{ Value: '10', Scenario: 'Future' }] },
    { id: 'many', records: [{ Value: '10' }, { Value: '20' }] },
    { id: 'nan', records: [{ Value: 'NaN' }] }, { id: 'band', records: [{ Value: '5', Band: 2 }] },
  ] });
  expect(mapped.get('zero').value).toBe(0);
  for (const id of ['missing', 'file', 'scenario', 'many', 'nan', 'band']) expect(mapped.get(id).value).toBeNull();
  expect(mapped.get('file').records[0].Data_x0020_File).toBe('Data');
});

test('multiple node memberships are visible without summing duplicate object values', () => {
  const frame = modelAssetFrame([...objects, { ...objects[0], id: 'g2', name: 'G2' }], new Map([
    ['g', { value: 10, unit: 'MW' }], ['g2', { value: 15, unit: 'MW' }],
  ]));
  expect(frame.markers).toHaveLength(2);
  expect(frame.markers[0].objects).toHaveLength(2);
  expect(frame.markers[0].maximum).toBe(15);
  expect(frame.hasValues).toBe(true);
});

test('shared Modelling snapshots use linked values and preserve source provenance', () => {
  const mapped = inputAssetValues({ resolution_contract: 'nohm.modelling.input-snapshot.v1', objects: [
    { id: 'linked', records: [{ Value: '0', Data_x0020_File: 'Capacity' }], resolution: {
      status: 'resolved', value: 482, unit: 'MW', provenance: { kind: 'datafile', filename: 'capacity.csv', row: 2 } } },
    { id: 'missing', records: [{ Value: '0' }], resolution: { status: 'unresolved', value: null, note: 'Missing linked cell' } },
    { id: 'zero', resolution: { status: 'resolved', value: 0, unit: 'MW' } },
    { id: 'invalid', resolution: { status: 'resolved', value: '', unit: 'MW' } },
  ] });
  expect(mapped.get('linked').value).toBe(482);
  expect(mapped.get('linked').provenance.filename).toBe('capacity.csv');
  expect(mapped.get('linked').records[0].Value).toBe('0');
  expect(mapped.get('missing').value).toBeNull();
  expect(mapped.get('zero').value).toBe(0);
  expect(mapped.get('invalid').value).toBeNull();
});

test('unlocated nodes do not get substitute coordinates or zero markers', () => {
  expect(modelAssetFrame([{ ...objects[0], nodes: [{ id: 'x', position: null }] }]).markers).toHaveLength(0);
});

test('incompatible input units do not share a magnitude scale', () => {
  expect(modelAssetFrame([...objects, { ...objects[0], id: 'g2' }],
    new Map([['g', { value: 10, unit: 'MW' }], ['g2', { value: 1, unit: 'GW' }]])).incompatibleUnits).toBe(true);
});

test('hidden and unlocated values do not distort the visible scale or its units', () => {
  const frame = modelAssetFrame([...objects, { ...objects[0], id: 'unlocated', nodes: [] }], new Map([
    ['g', { value: 25, unit: 'MW' }], ['hidden', { value: 900, unit: 'GW' }],
    ['unlocated', { value: 800, unit: 'GW' }],
  ]));
  expect(frame).toMatchObject({ maximum: 25, hasValues: true, incompatibleUnits: false });
});

test.each([NaN, Infinity, -Infinity, '', true])('invalid measurement %p is not a measured magnitude', value => {
  const frame = modelAssetFrame(objects, new Map([['g', { value, unit: 'MW' }]]));
  expect(frame).toMatchObject({ maximum: 0, hasValues: false });
  expect(frame.markers.every(marker => marker.measured === 0)).toBe(true);
});

test('outputs are joined by native object identity with actual period and zero', () => {
  const result = assetOutputSeries(payload, objects, { projectId: 'P' }, selection);
  expect(result.series.get('2050-01-01').get('g').value).toBe(0);
  expect(result.periods).toEqual(['2050-01-01']);
});

test.each([
  { ...payload, project_id: 'Other' }, { ...payload, runs: [] },
  { ...payload, runs: [{ run_id: 'native:x', schema_version_id: 'v2' }] },
  { ...payload, rows: [{ ...payload.rows[0], run_id: 'other' }] },
  { ...payload, rows: [{ ...payload.rows[0], class_name: 'Battery' }] },
  { ...payload, rows: [{ ...payload.rows[0], property_name: 'Load' }] },
  { ...payload, rows: [...payload.rows, ...payload.rows] },
  { ...payload, summary: { row_count_before_limit: 10 } },
  { ...payload, rows: [{ ...payload.rows[0], value: null }] },
])('rejects foreign, ambiguous, missing or truncated output provenance', bad => {
  expect(() => assetOutputSeries(bad, objects, { projectId: 'P' }, selection)).toThrow();
});

test('scene binding is exact', () => {
  expect(() => validateAssetBinding({ project_id: 'P', model_version: 'v2' }, 'P', 'v1')).toThrow();
});

test.each(['', '   ', true])('non-numeric output %p is not coerced into a measured zero', value => {
  expect(() => assetOutputSeries({ ...payload, rows: [{ ...payload.rows[0], value }] }, objects, { projectId: 'P' }, selection)).toThrow();
});

test.each([
  { unit_name: '' }, { unit_name: 'GWh' }, { report_family: 'LT' },
  { time_bucket: '2050-01-03T00:00:00Z' },
])('outputs validate selected units, report family and window: %p', patch => {
  expect(() => assetOutputSeries({ ...payload, rows: [{ ...payload.rows[0], report_family: 'ST', ...patch }] }, objects,
    { projectId: 'P' }, { ...selection, unit: 'MW', reportFamily: 'ST', dateFrom: '2050-01-01', dateTo: '2050-01-01' })).toThrow();
});

test.each([['', '2050-01-01'], ['2050-02-30', '2050-03-01'], ['2050-02-01', '2050-01-01'],
  ['2050-01-01', '2050-02-01']])('reject invalid or oversized hourly window %p %p', (from, to) => {
  expect(() => validateAssetWindow(from, to, 'hour')).toThrow();
});

test('31 inclusive hourly days and a long daily window are allowed', () => {
  expect(() => validateAssetWindow('2050-01-01', '2050-01-31', 'hour')).not.toThrow();
  expect(() => validateAssetWindow('2050-01-01', '2050-12-31', 'day')).not.toThrow();
});

test('coarse buckets may begin before the requested window', () => {
  const result = assetOutputSeries(payload, objects, { projectId: 'P' },
    { ...selection, dateFrom: '2050-01-15', dateTo: '2050-01-20', granularity: 'month' });
  expect(result.periods).toEqual(['2050-01-01']);
});

test('wrong-run catalogue fails closed', async () => {
  const original = window.fetch;
  window.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ runs: [{ run_id: 'native:x', schema_version_id: 'v1' }] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ run_id: 'native:other' }) });
  try { await expect(fetchAssetOutputsCatalog('P', 'v1', 'Generator')).rejects.toThrow('another result run'); }
  finally { window.fetch = original; }
});
