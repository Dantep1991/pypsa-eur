import { assetOutputSeries } from './modelAssets';
import { assetOutputUnit, assetOutputWindow } from './assetOutputContract';

const run = { run_id: 'solution:x', version_hint: 'v1', registry_versions: ['v1'], result_model_version: 'v1' };
const selection = { runId: run.run_id, runBinding: run, modelVersion: 'v1', className: 'Generator',
  propertyName: 'Generation', reportFamily: 'ST', granularity: 'hour', dateFrom: '2037-01-01', dateTo: '2037-01-01' };
const row = { run_id: run.run_id, class_name: 'Generator', property_name: 'Generation', report_family: 'ST',
  entity_name: 'G', time_bucket: '2037-01-01T00:00:00Z', value: 310.1, unit_name: 'MWh' };
// Actual SolutionWorkspace envelope: no `runs` block, but query and row IDs.
const payload = { project_id: 'P', query: { run_ids: [run.run_id] }, rows: [row], missing_runs: [],
  summary: { row_count_before_limit: 1 } };
const objects = [{ id: 'g', name: 'G' }], context = { projectId: 'P' };

test('registered legacy solution outputs map against independently bound catalogue metadata', () => {
  const result = assetOutputSeries(payload, objects, context, selection);
  expect(result.series.get(row.time_bucket).get('g')).toMatchObject({ value: 310.1, unit: 'MWh' });
  expect(result.unit).toBe('MWh');
  expect(result.unmatched).toBe(0);
});

test.each([
  ['missing catalogue binding', { ...selection, runBinding: undefined }],
  ['foreign catalogue run', { ...selection, runBinding: { ...run, run_id: 'other' } }],
  ['foreign catalogue version', { ...selection, runBinding: { ...run, version_hint: 'v2' } }],
  ['conflicting registered versions', { ...selection, runBinding: { ...run, registry_versions: ['v1', 'v2'] } }],
  ['unresolved catalogue binding', { ...selection, runBinding: { ...run, binding_status: 'unresolved' } }],
  ['no registered version', { ...selection, runBinding: { run_id: run.run_id, result_model_version: 'v1' } }],
  ['foreign loaded version', { ...selection, modelVersion: 'v2' }],
])('rejects %s in a legacy solution', (_label, badSelection) => {
  expect(() => assetOutputSeries(payload, objects, context, badSelection)).toThrow(/provenance/);
});

test.each([
  ['foreign project', { ...payload, project_id: 'Other' }],
  ['missing project', { ...payload, project_id: undefined }],
  ['missing query identity', { ...payload, query: {} }],
  ['foreign query identity', { ...payload, query: { run_ids: ['other'] } }],
  ['multiple query runs', { ...payload, query: { run_ids: [run.run_id, 'other'] } }],
  ['explicit empty run metadata', { ...payload, runs: [] }],
  ['foreign row identity', { ...payload, rows: [{ ...row, run_id: 'other' }] }],
  ['missing row identity', { ...payload, rows: [{ ...row, run_id: undefined }] }],
  ['missing rows', { ...payload, rows: undefined }],
])('rejects %s rather than fabricating result provenance', (_label, badPayload) => {
  expect(() => assetOutputSeries(badPayload, objects, context, selection)).toThrow(/provenance/);
});

test.each([
  { ...payload, rows: [row, row] },
  { ...payload, summary: { row_count_before_limit: 2 } },
  { ...payload, missing_runs: [{ run_id: run.run_id, reason: 'Source missing' }] },
  { ...payload, rows: [{ ...row, time_bucket: '2037-01-02T00:00:00Z' }] },
  { ...payload, rows: [{ ...row, report_family: 'LT' }] },
  { ...payload, rows: [{ ...row, unit_name: '' }] },
  { ...payload, rows: [row, { ...row, time_bucket: '2037-01-01T01:00:00Z', unit_name: 'GWh' }] },
])('legacy envelopes retain completeness, window, family and unit guards', bad => {
  expect(() => assetOutputSeries(bad, objects, context, selection)).toThrow();
});

test('native and retained run metadata remains authoritative without catalogue fallback', () => {
  expect(assetOutputSeries({ ...payload, runs: [{ run_id: run.run_id, schema_version_id: 'v1' }] }, objects,
    context, { ...selection, runBinding: undefined }).unit).toBe('MWh');
  expect(() => assetOutputSeries({ ...payload, runs: [{ run_id: run.run_id, schema_version_id: 'v2' }] },
    objects, context, selection)).toThrow(/provenance/);
});

test('declared resolution units are checked, annual-only units do not override hourly source units', () => {
  const annualOnly = { unit: 'GWh' };
  expect(assetOutputUnit(annualOnly, 'year')).toBe('GWh');
  expect(assetOutputUnit(annualOnly, 'hour')).toBe('');
  expect(assetOutputUnit(annualOnly, 'day')).toBe('');
  expect(assetOutputUnit({ ...annualOnly, units_by_granularity: { hour: 'MWh' } }, 'hour')).toBe('MWh');
  expect(() => assetOutputSeries(payload, objects, context, { ...selection, unit: 'GWh' })).toThrow(/units/);
});

test('annual queries include the complete year; hourly defaults to a bounded day', () => {
  expect(assetOutputWindow('2037', 'year')).toEqual({ from: '2037-01-01', to: '2037-12-31' });
  expect(assetOutputWindow('2037', 'hour')).toEqual({ from: '2037-01-01', to: '2037-01-01' });
});
