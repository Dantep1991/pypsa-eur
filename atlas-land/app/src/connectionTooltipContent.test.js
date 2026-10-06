import { connectionTooltipContent } from './connectionTooltipContent';

test('comparison tooltip retains zero, both values, signed delta, period and reversal directions', () => {
  const content = connectionTooltipContent({ name: 'L', atlas_result_baseline_value: 0,
    atlas_result_candidate_value: -5, atlas_result_value: -5, atlas_result_unit: 'GWh',
    atlas_result_label: 'Δ Flow', atlas_result_period: 'Annual 2037', atlas_result_direction_changed: true,
    atlas_result_direction_supported: true, atlas_result_direction_value: -5,
    atlas_result_from_node: 'B', atlas_result_to_node: 'A', atlas_result_baseline_from_node: 'A', atlas_result_baseline_to_node: 'B',
  }, { value: 0, kind: 'Declared capacity', units: 'MW' });
  const root = document.createElement('div'); root.innerHTML = content;
  expect(root.textContent).toContain('Baseline0 GWh');
  expect(root.textContent).toContain('Candidate-5 GWh');
  expect(root.textContent).toContain('Flow direction reversed');
  expect(root.textContent).toContain('Direction: B → A');
  expect(root.textContent).toContain('Annual 2037');
  expect(root.textContent).toContain('Declared capacity0 MW');
});

test('names, endpoint IDs, labels and units are escaped and missing results are not zero', () => {
  const name = '<img src=x onerror=alert(1)>';
  const root = document.createElement('div');
  root.innerHTML = connectionTooltipContent({ name, from: name, to: 'B', atlas_result_value: null, atlas_result_label: name }, null);
  expect(root.querySelector('img')).toBeNull(); expect(root.textContent).toContain(name);
  expect(root.textContent).not.toContain('Result0');
});
test('disabled tooltip names persisted zero-capacity evidence and model scope', () => {
  const html = connectionTooltipContent({ name: 'A-B', source_model_name: 'Branch', operational_state: {
    status: 'disabled', reason: 'Max Flow = 0 and Min Flow = 0' } });
  expect(html).toContain('Disabled — zero capacity');
  expect(html).toContain('Branch');
  expect(html).toContain('Max Flow = 0 and Min Flow = 0');
});

test('derived tooltip values retain small percentages and negative nonzero results', () => {
  expect(connectionTooltipContent({ atlas_result_value: 0.0014045, atlas_result_unit: '%', atlas_result_label: 'Share' }, null)).toContain('0.0014 %');
  expect(connectionTooltipContent({ atlas_result_value: -0.0000007, atlas_result_unit: '%', atlas_result_label: 'Change' }, null)).toContain('-7E-7 %');
});
