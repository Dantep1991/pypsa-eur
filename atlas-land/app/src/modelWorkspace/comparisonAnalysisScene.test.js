import { comparisonAnalysisScene } from './comparisonAnalysisScene';
import { analysisViewFor } from '../hooks/useAtlasAnalysisBridge';

function document(cls = 'Node', property = 'Price', unit = '$/MWh') {
  const pointer = { project_id: 'Example', model_version: 'v1', class_name: cls, property_name: property,
    report_family: 'ST', granularity: 'year', date_from: '2030-01-01', date_to: '2030-12-31', entity_names: [], nodes: [], countries: [] };
  return { analysis_id: 'a'.repeat(32), class_name: cls, unit, category: '',
    comparison: { baseline: { ...pointer, run_id: 'base' }, candidate: { ...pointer, run_id: 'candidate' }, property_name: property, preference: 'decrease' },
    queries: { baseline: { query: { ...pointer, run_ids: ['base'] } }, candidate: { query: { ...pointer, run_ids: ['candidate'] } } },
    rows: [{ entity_id: `${cls}:A`, object_name: 'A', period: '2030', value: 5,
      inputs: { baseline: 10, candidate: 15 }, from_node: 'A', to_node: 'B' }] };
}

test('analysis comparisons reuse bubbles, exact pair pointers and favourable colours', () => {
  const scene = comparisonAnalysisScene(document());
  expect(scene.selection.map_mode).toBe('bubbles');
  expect(scene.values[0]).toMatchObject({ value: 5, baseline_value: 10, candidate_value: 15 });
  const view = analysisViewFor({ mode: 'model', projectId: 'Example' }, 'v1', scene, null, 'native', 'new-view');
  expect(view.comparison.baseline.run_id).toBe('base');
  expect(view.comparison.candidate.run_id).toBe('candidate');
  expect(view.analysis_id).toBe('a'.repeat(32));
});

test('signed line reversal uses the standard directional comparison map', () => {
  const data = document('Line', 'Net Flow', 'GWh');
  data.rows[0].inputs.candidate = -15;
  const scene = comparisonAnalysisScene(data);
  expect(scene.selection.map_mode).toBe('flow');
  expect(scene.values[0].flow_direction_changed).toBe(true);
  expect(scene.values[0].value).toBe(-25);
});

test('multiple periods and invalid data cannot be silently collapsed', () => {
  const data = document();
  data.rows.push({ ...data.rows[0], period: '2031' });
  expect(() => comparisonAnalysisScene(data)).toThrow('single displayed period');
  expect(comparisonAnalysisScene(data, '2030').values).toHaveLength(1);
  data.rows[0].inputs.candidate = NaN;
  expect(() => comparisonAnalysisScene(data, '2030')).toThrow('Invalid comparison');
});
