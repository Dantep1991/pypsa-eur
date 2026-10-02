import { compareResultScenes, comparisonColour, validateComparisonTopology } from './resultComparison';
import { adaptModelResultScene, decorateModelResultRecord, MODEL_RESULT_SCENE_SCHEMA } from './resultScene';
import { directionalResultLines, resultLineWidth } from './resultPresentation';

const scene = (run, values, extra = {}) => adaptModelResultScene({ schema: MODEL_RESULT_SCENE_SCHEMA,
  project_id: 'Example', model_version: 'v1', run: { run_id: run, label: run },
  selection: { class_name: 'Node', property_name: 'Price', period: '2050', map_mode: 'bubbles', map_target: 'node' },
  legend: { unit: 'EUR/MWh' }, values: values.map(([id, value]) => ({ entity_id: id, value, unit: extra.legend?.unit || 'EUR/MWh' })), ...extra });

test('delta joins exact identities, preserves zero, excludes missing observations', () => {
  const a = scene('base', [['A', 40], ['B', 0], ['C', 2]]), b = scene('new', [['A', 30], ['B', 0], ['D', 9]]);
  const original = JSON.stringify([a, b]);
  const delta = compareResultScenes(a, b, 'decrease');
  expect(delta.values.map(row => row.value)).toEqual([-10, 0]);
  expect(delta.values[0]).toMatchObject({ baseline_value: 40, candidate_value: 30, comparison_color: '#22c55e' });
  expect(delta.comparison).toMatchObject({ matched: 2, baseline_only: 1, candidate_only: 1 });
  expect(JSON.stringify([a, b])).toBe(original);
});
test.each(['period', 'property_name', 'category', 'class_name'])('rejects incompatible %s', key => {
  const a = scene('a', [['A', 2]]), b = scene('b', [['A', 3]]); b.selection[key] = 'different';
  expect(() => compareResultScenes(a, b)).toThrow(/does not match/);
});
test('rejects units, duplicate identities, non-finite values, and no common observations', () => {
  const a = scene('a', [['A', 2]]), b = scene('b', [['A', 3]]);
  b.legend.unit = 'GWh'; expect(() => compareResultScenes(a, b)).toThrow(/units/);
  b.legend.unit = 'EUR/MWh'; b.values.push(b.values[0]); expect(() => compareResultScenes(a, b)).toThrow(/duplicate/);
  expect(() => compareResultScenes(a, scene('c', [['A', NaN]]))).toThrow(/invalid/);
  expect(() => compareResultScenes(a, scene('c', [['Z', 2]]))).toThrow(/No common/);
});
test('interpretation is explicit and reversible; unknown meaning remains neutral', () => {
  expect(comparisonColour(2, 'increase')).toBe('#22c55e');
  expect(comparisonColour(2, 'decrease')).toBe('#ef4444');
  expect(comparisonColour(-2, 'decrease')).toBe('#22c55e');
  expect(comparisonColour(0, 'increase')).toBe('#a3a3a3');
  expect(comparisonColour(2, 'unknown')).toBe('#a3a3a3');
});

test('result-specific coordinates and endpoints are validated beyond the base electricity scene', () => {
  const a = scene('a', [['A', 2]], { spatial_nodes: [{ id: 'A', latitude: 50, longitude: 4 }] });
  const b = scene('b', [['A', 3]], { spatial_nodes: [{ id: 'A', latitude: 51, longitude: 4 }] });
  expect(() => compareResultScenes(a, b)).toThrow(/different coordinates/);
  b.spatial_nodes = a.spatial_nodes;
  a.values[0] = { ...a.values[0], from_node: 'N1', to_node: 'N2' };
  b.values[0] = { ...b.values[0], from_node: 'N1', to_node: 'N3' };
  expect(() => compareResultScenes(a, b)).toThrow(/different result endpoints/);
  b.values[0].to_node = 'N2'; a.values[0].spatial_binding_valid = false;
  expect(() => compareResultScenes(a, b)).toThrow(/No common/);
});
test('comparison flow direction follows candidate flow, not negative delta', () => {
  const extra = { selection: { class_name: 'Line', property_name: 'Flow', period: '2050', map_mode: 'flow', map_target: 'link', direction_supported: true }, legend: { unit: 'GWh' } };
  const a = scene('a', [['Line:L', 20]], extra), b = scene('b', [['Line:L', 10]], extra);
  b.values[0].from_node = 'A'; b.values[0].to_node = 'B';
  const delta = compareResultScenes(a, b, 'increase');
  const line = decorateModelResultRecord({ id: 'Line:L', from: 'Node:A', to: 'Node:B' }, delta);
  const arrows = directionalResultLines({ features: [{ properties: { connection: line }, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } }] });
  expect(line.atlas_result_value).toBe(-10);
  expect(arrows[0].coordinates).toEqual([[1, 2], [3, 4]]);
  expect(line.properties.find(p => p.Property === 'Baseline value').Value).toBe(20);
});
test('canonical topology rejects shifted nodes and reused connection IDs', () => {
  const a = { facilities: [{ id: 'A', latitude: 1, longitude: 2 }], connections: [{ id: 'L', from: 'A', to: 'B' }] };
  expect(() => validateComparisonTopology(a, a)).not.toThrow();
  expect(() => validateComparisonTopology(a, { ...a, facilities: [{ id: 'A', latitude: 2, longitude: 2 }] })).toThrow(/coordinates/);
  expect(() => validateComparisonTopology(a, { ...a, connections: [{ id: 'L', from: 'A', to: 'C' }] })).toThrow(/endpoints/);
});
test('line width increases with absolute magnitude and remains readable at zero', () => {
  expect(resultLineWidth(0)).toBe(1.5); expect(resultLineWidth(1)).toBe(8.5);
  expect(resultLineWidth(.1)).toBeLessThan(resultLineWidth(.5));
});

test('physical flow reversal has a distinct theme-aware colour, but zero is not a reversal', () => {
  const extra = { selection: { class_name: 'Line', property_name: 'Flow', period: '2050', map_mode: 'flow', map_target: 'link', direction_supported: true }, legend: { unit: 'GWh' } };
  const a = scene('a', [['Line:L', 20]], extra), b = scene('b', [['Line:L', -10]], extra);
  [a, b].forEach(item => { item.values[0].from_node = 'A'; item.values[0].to_node = 'B'; });
  const delta = compareResultScenes(a, b, 'increase');
  expect(delta.values[0]).toMatchObject({ value: -30, flow_direction_changed: true, baseline_value: 20, candidate_value: -10 });
  expect(delta.comparison.direction_changed).toBe(1);
  const record = { id: 'Line:L', from: 'Node:A', to: 'Node:B' };
  expect(decorateModelResultRecord(record, delta, 'dark').atlas_result_color).toBe('#6CB4D0');
  expect(decorateModelResultRecord(record, delta, 'light').atlas_result_color).toBe('#1C7293');
  b.values[0].value = 0;
  expect(compareResultScenes(a, b).values[0].flow_direction_changed).toBe(false);
});

test('reversed schema orientation is normalized and magnitude reduction is unfavourable even for negative flows', () => {
  const extra = { selection: { class_name: 'Line', property_name: 'Flow', period: '2050', map_mode: 'flow', map_target: 'link', direction_supported: true }, legend: { unit: 'GWh' } };
  const a = scene('a', [['Line:L', 20]], extra), b = scene('b', [['Line:L', -20]], extra);
  a.values[0] = { ...a.values[0], from_node: 'A', to_node: 'B' };
  b.values[0] = { ...b.values[0], from_node: 'B', to_node: 'A' };
  expect(compareResultScenes(a, b, 'increase').values[0]).toMatchObject({ value: 0, flow_direction_changed: false });
  a.values[0] = { ...a.values[0], value: -20 };
  b.values[0] = { ...b.values[0], value: -10, from_node: 'A', to_node: 'B' };
  expect(compareResultScenes(a, b, 'increase').values[0]).toMatchObject({ value: 10, desirability_delta: -10, comparison_color: '#ef4444' });
});
