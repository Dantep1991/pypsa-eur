import { analysisViewFor, derivedAnalysisScene, selectedAnalysisSource } from './useAtlasAnalysisBridge';
import { projectModelResultScene } from '../modelWorkspace/resultScene';

const context = { mode: 'model', projectId: 'Example' };
const query = { run_ids: ['native:one'], class_name: 'Line', property_name: 'Flow', granularity: 'year',
  date_from: '2030-01-01', date_to: '2030-12-31T23:59:59', entity_names: ['A-B'], nodes: [], countries: [] };

test('multi-category scope stays attached to displayed and derived analysis', () => {
  const categories = ['Grid', 'Hydrogen'];
  const view = analysisViewFor(context, 'v1', { analysis_query: { ...query, entity_names: ['A-B', 'B-C'] },
    selection: { category: '', categories } }, null, 'native', 'multi');
  expect(view).toMatchObject({ categories, category: '', entity_names: ['A-B', 'B-C'] });
  expect(derivedAnalysisScene({ ...document(), category: '', categories, view }).selection.categories).toEqual(categories);
});

test('analysis can read the selected solution before any values have been drawn', () => {
  const selected = { runId: 'native:one', runModelVersion: 'v1', className: 'Line', propertyName: 'Flow',
    period: '2030', category: 'Grid', categoryObjects: ['A-B'], reportFamily: 'ST' };
  const source = selectedAnalysisSource(selected, 'v1');
  expect(analysisViewFor(context, 'v1', source, null, 'native', 'selected')).toMatchObject({
    run_id: 'native:one', class_name: 'Line', category: 'Grid', entity_names: ['A-B'], granularity: 'year' });
  expect(selectedAnalysisSource(selected, 'v2')).toBeNull();
  expect(selectedAnalysisSource({ ...selected, runId: '' }, 'v1')).toBeNull();
});

test('publish exact run, model, period and object filters, never painted values', () => {
  expect(analysisViewFor(context, 'v1', { analysis_query: query, selection: { category: 'Grid' } }, null, 'native', 'view'))
    .toMatchObject({ view_id: 'view', run_id: 'native:one', model_version: 'v1', entity_names: ['A-B'], category: 'Grid' });
  expect(analysisViewFor(context, 'v1', { analysis_query: { ...query, run_ids: ['one', 'two'] } }, null, 'native', 'view')).toBeNull();
});

test('comparison publishes both source queries, not painted deltas or only the candidate', () => {
  const result = { analysis_query: query, selection: { category: 'Grid', property_name: 'Net Flow', map_mode: 'flow' },
    legend: { unit: 'GWh' }, values: [{ value: 999 }], comparison: {
      baseline: { run_id: 'native:base' }, candidate: { run_id: 'native:one' },
      baseline_project: 'Example', candidate_project: 'Other', baseline_version: 'v1', candidate_version: 'v2',
      baseline_query: { ...query, run_ids: ['native:base'], entity_names: ['B-C'] }, candidate_query: query,
      preference: 'decrease', derivation: 'Reported Flow − Flow Back' } };
  const view = analysisViewFor(context, 'v1', result, null, 'country', 'comparison');
  expect(view.comparison).toMatchObject({ delta: 'candidate_minus_baseline', unit: 'GWh',
    baseline: { run_id: 'native:base', project_id: 'Example', model_version: 'v1', entity_names: ['B-C'] },
    candidate: { run_id: 'native:one', project_id: 'Other', model_version: 'v2', entity_names: ['A-B'] },
    displayed_property: 'Net Flow', derivation: 'Reported Flow − Flow Back' });
  expect(JSON.stringify(view)).not.toContain('999');
  expect(analysisViewFor(context, 'v1', { ...result, comparison: { ...result.comparison, baseline_query: null } }, null, 'native', 'bad')).toBeNull();
  // Replacing a comparison with normal results / flow must not retain its pair.
  expect(analysisViewFor(context, 'v1', result, { analysis_query: query }, 'native', 'flow').comparison).toBeUndefined();
});

test.each([['hour', '2030-01-01T00:59:59.000Z'], ['day', '2030-01-01T23:59:59.000Z'],
  ['week', '2030-01-07T23:59:59.000Z'], ['month', '2030-01-31T23:59:59.000Z'], ['year', '2030-12-31T23:59:59.000Z']])(
  'flow playback publishes only its displayed %s period', (granularity, end) => {
    const view = analysisViewFor(context, 'v1', null, { analysis_query: { ...query, granularity },
      period: '2030-01-01T00:00:00Z', analysis_selection: { category: 'Grid' } }, 'native', 'view');
    expect(view.date_to).toBe(end); expect(view.date_from).toBe('2030-01-01T00:00:00.000Z');
  });

function document(cls = 'Line') {
  return { view: { project_id: 'Example', model_version: 'v1', run_id: 'native:one' }, name: 'Derived',
    class_name: cls, analysis_id: 'a'.repeat(32), expression: 'e/c', unit: 'h', category: 'Grid', excluded: [],
    queries: { e: { query } }, rows: [{ entity_id: `${cls}:A`, object_name: 'A', value: 2500, period: '2030' }] };
}

test('new metrics use normal line and circle map styles with their derived unit', () => {
  const line = derivedAnalysisScene(document());
  expect(line.selection.map_target).toBe('link'); expect(line.legend.unit).toBe('h');
  expect(line.valueByEntityId.get('Line:A').value).toBe(2500);
  expect(derivedAnalysisScene(document('Generator')).selection.map_mode).toBe('bubbles');
});

test('no hidden averaging of multiple periods or nonfinite map values', () => {
  const data = document(); data.rows.push({ ...data.rows[0], period: '2031' });
  expect(() => derivedAnalysisScene(data)).toThrow('single displayed period');
  expect(derivedAnalysisScene(data, '2030').values).toHaveLength(1);
  data.rows = [{ ...data.rows[0], value: Infinity }];
  expect(() => derivedAnalysisScene(data)).toThrow('Invalid calculated');
});

test('large valid derived layers do not exceed the JavaScript argument limit', () => {
  const data = document('Node');
  data.rows = Array.from({ length: 150000 }, (_, index) => ({ entity_id: `Node:${index}`, object_name: String(index), value: index, period: '2030' }));
  const scene = derivedAnalysisScene(data);
  const facilities = data.rows.map(row => ({ id: row.entity_id, latitude: 50, longitude: 5 }));
  const projected = projectModelResultScene(scene, facilities);
  expect(projected.values).toHaveLength(150000);
  expect(projected.legend).toMatchObject({ minimum: 0, maximum: 149999 });
});
