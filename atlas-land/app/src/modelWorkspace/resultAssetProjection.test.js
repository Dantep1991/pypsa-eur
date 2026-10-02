import { attachAssetPositions, attachPipelinePositions, objectResultTarget } from './resultAssetProjection';
import { projectModelResultScene } from './resultScene';

const assets = { source: 'model_schema/v1', objects: [{ name: 'A000CH4', class_name: 'GasNode',
  nodes: [{ name: 'A000CH4', position: { lat: 40, lon: 3, canonical_reference: 'Node:A000', method: 'project_declared_node_prefix' } }] }] };
const scene = { selection: { map_target: 'node' }, legend: {}, values: [{ entity_id: 'Gas Node:A000CH4', object_name: 'A000CH4', value: 25 }] };
test('gas results retain native identity and map using validated project aliases, not summed names', () => {
  const mapped = attachAssetPositions(scene, assets);
  expect(mapped.spatial_nodes[0]).toMatchObject({ id: 'Gas Node:A000CH4', latitude: 40, canonical_reference: 'Node:A000' });
  const visible = projectModelResultScene(mapped, [{ id: 'Node:A000', latitude: 40, longitude: 3 }]);
  expect(visible.values[0].value).toBe(25);
  // Native, version-validated gas coordinates do not require an electricity bus to be visible.
  expect(projectModelResultScene(mapped, []).values).toHaveLength(1);
});

test('native hydrogen line positions and exact category membership are not limited to the electricity grid', async () => {
  const topology = { project_id: 'Example', model_version: 'v1', class_name: 'Line',
    nodes: [{ id: 'Node:H1', name: 'H1', position: { lat: 40, lon: 3 } }, { id: 'Node:H2', name: 'H2', position: { lat: 41, lon: 4 } }],
    lines: [{ id: 'Line:L', name: 'L', node_class: 'Node', from_node: 'H1', to_node: 'H2', coordinates: [[3, 40], [4, 41]] }] };
  const source = { selection: { map_target: 'link' }, legend: {}, values: [{ entity_id: 'Line:L', value: 20, from_node: 'H1', to_node: 'H2' }] };
  const mapped = await attachPipelinePositions(source, {}, {}, {}, null, topology);
  expect(mapped.spatial_links[0]).toMatchObject({ from: 'Node:H1', to: 'Node:H2' });
  expect(projectModelResultScene(mapped, [{ id: 'Node:E', latitude: 50, longitude: 5 }]).values).toHaveLength(1);
  const invalid = await attachPipelinePositions({ ...source, values: [{ ...source.values[0], from_node: 'Different' }] }, {}, {}, {}, null, topology);
  expect(invalid.spatial_links).toHaveLength(0); expect(invalid.coverage.endpoint_mismatch_count).toBe(1);
  expect(projectModelResultScene(invalid, []).values).toHaveLength(0);
  expect(projectModelResultScene(invalid, [
    { id: 'Node:H1', latitude: 40, longitude: 3 }, { id: 'Node:H2', latitude: 41, longitude: 4 },
  ], [{ id: 'Line:L', from: 'Node:H1', to: 'Node:H2' }]).values).toHaveLength(0);
});
test('ambiguous names, missing coordinates and spatially distinct memberships remain unmapped', () => {
  expect(attachAssetPositions(scene, { ...assets, objects: [...assets.objects, assets.objects[0]] }).spatial_nodes).toEqual([]);
  expect(attachAssetPositions(scene, { objects: [{ ...assets.objects[0], nodes: [{ name: 'A', position: null }] }] }).spatial_nodes).toEqual([]);
  expect(attachAssetPositions(scene, { objects: [{ ...assets.objects[0], nodes: [...assets.objects[0].nodes, { position: { lat: 50, lon: 3 } }] }] }).spatial_nodes).toEqual([]);
});
test('native nodes and energy pies retain their established aggregation contracts', () => {
  expect(objectResultTarget({ className: 'Node' })).toBe(false);
  expect(objectResultTarget({ className: 'Gas Node' })).toBe(true);
  expect(objectResultTarget({ className: 'Generator', mapMode: 'mix' })).toBe(false);
});
