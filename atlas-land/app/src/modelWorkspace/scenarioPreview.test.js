import { mappedPreviewCount, previewMatchesScene, projectScenarioPreview, SCENARIO_PREVIEW_MESSAGE } from './scenarioPreview';
import { scenarioPreviewContent } from '../scenarioPreviewContent';
import { connectionTooltipContent } from '../connectionTooltipContent';

const line = { id: 'Line:A-B', component_type: 'Line', name: 'A-B', from: 'Node:A', to: 'Node:B', operational_state: { status: 'active' } };
const scene = { meta: { projectId: 'P', version: 'v1', modelName: 'Branch' }, facilities: [{ id: 'Node:A', latitude: 50, longitude: 4 }, { id: 'Node:B', latitude: 52, longitude: 5 }], connections: [line] };
const report = { schema: SCENARIO_PREVIEW_MESSAGE, preview_id: 'abc', project_id: 'P', model_version: 'v1', model_name: 'Branch',
  input_date: '2050-07-01T00:00:00', scenarios: ['Outage'],
  objects: [{ object_id: line.id, changed: true, unresolved: false, disabled: true, reason: 'Units = 0', values: { Units: 0 } }],
  changes: [{ object_id: line.id, property: 'Units', before: { status: 'resolved', value: 1 }, after: { status: 'resolved', value: 0 } }] };

test('disabled line remains visible, scoped, highlighted, without source mutation', () => {
  const projected = projectScenarioPreview(scene, report);
  expect(projected.connections).toHaveLength(1);
  expect(projected.connections[0].operational_state.status).toBe('disabled');
  expect(projected.connections[0].scenario_preview.inputDate).toBe(report.input_date);
  expect(line.operational_state.status).toBe('active');
  expect(mappedPreviewCount(scene, report)).toBe(1);
  expect(projectScenarioPreview(scene, null)).toBe(scene);
});
test.each(['project_id', 'model_version', 'model_name'])('foreign %s cannot be mapped', key => {
  const wrong = { ...report, [key]: 'Other' };
  expect(previewMatchesScene(wrong, scene)).toBe(false);
  expect(projectScenarioPreview(scene, wrong)).toBe(scene);
});
test('unresolved conditions never disable assets', () => {
  const projected = projectScenarioPreview(scene, { ...report, objects: [{ object_id: line.id, unresolved: true, disabled: false }] });
  expect(projected.connections[0].operational_state.status).toBe('unknown');
  expect(projected.connections[0].scenario_preview.status).toBe('unresolved');
});
test('coverage does not claim lines with missing coordinates are mapped', () => {
  expect(mappedPreviewCount({ ...scene, facilities: [] }, report)).toBe(0);
});

test('a confirmed alternative schema line uses only existing mapped endpoints and clears cleanly', () => {
  const alternative = { ...report, objects: [{ ...report.objects[0], object_id: 'Line:Alternative',
    connection: { id: 'Line:Alternative', name: 'Alternative', category: 'Expansion', from_node: 'Node:A', to_node: 'Node:B' } }],
    changes: [{ ...report.changes[0], object_id: 'Line:Alternative' }] };
  const projected = projectScenarioPreview(scene, alternative);
  expect(projected.connections).toHaveLength(2);
  const added = projected.connections.find(row => row.id === 'Line:Alternative');
  expect(added.operational_state.status).toBe('disabled');
  expect(added.atlas_scenario_additional).toBe(true);
  expect(added.source_model_version).toBe('v1');
  expect(mappedPreviewCount(scene, alternative)).toBe(1);
  expect(projectScenarioPreview(scene, null).connections).toEqual([line]);
  expect(scene.connections).toHaveLength(1);
});

test.each(['missing endpoint', 'unresolved state', 'mismatched source id'])('no alternative geometry is invented for %s', reason => {
  const state = { ...report.objects[0], object_id: 'Line:Alternative',
    connection: { id: 'Line:Alternative', from_node: 'Node:A', to_node: 'Node:B' } };
  if (reason === 'missing endpoint') state.connection.to_node = 'Node:Unknown';
  if (reason === 'unresolved state') Object.assign(state, { changed: false, disabled: false, unresolved: true });
  if (reason === 'mismatched source id') state.connection.id = line.id;
  const alternative = { ...report, objects: [state] };
  expect(projectScenarioPreview(scene, alternative).connections).toHaveLength(1);
  expect(mappedPreviewCount(scene, alternative)).toBe(0);
});
test('tooltip contains exact snapshot before/after and escapes source markup', () => {
  const record = projectScenarioPreview(scene, report).connections[0];
  expect(connectionTooltipContent(record)).toContain('With scenarios: 0');
  expect(connectionTooltipContent(record)).toContain('2050-07-01');
  const html = scenarioPreviewContent({ changes: [{ property: '<script>x</script>', after: { status: 'unresolved', note: '<img>' } }] });
  expect(html).not.toContain('<script>'); expect(html).toContain('&lt;img&gt;');
});
