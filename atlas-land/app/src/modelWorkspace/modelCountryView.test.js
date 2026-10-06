import { scopeModelCountryView } from './modelCountryView';
import { modelAssetFrame } from './modelAssets';

const es = { id: 'Node:Spain', name: 'Spanish bus', country: 'ES', position: { lat: 40, lon: -3 } };
const fr = { id: 'Node:France', name: 'French bus', country: 'FR', position: { lat: 45, lon: 2 } };
const pt = { id: 'Node:Portugal', name: 'Portuguese bus', country: 'PT', position: { lat: 39, lon: -8 } };
const cross = { id: 'Line:cross', from_node: es.id, to_node: fr.id };
const outside = { id: 'Line:outside', from_node: fr.id, to_node: pt.id };
const assets = [
  { id: 'plant-es', name: 'ES plant', nodes: [es] },
  { id: 'plant-fr', name: 'FR plant', nodes: [fr] },
];
const assetsFrame = modelAssetFrame(assets, new Map([
  ['plant-es', { value: 20, unit: 'MW' }], ['plant-fr', { value: 90, unit: 'MW' }],
]), 'Capacity', 'plant-fr', true);
const layers = {
  sourceNodes: [es, fr, pt], sourceLinks: [cross, outside], facilities: [es, fr, pt], connections: [cross, outside], assetsFrame,
  flowFrame: { lines: [{ ...cross, value: 4 }, { ...outside, value: 8 }], maximum: 8, selectedId: outside.id, animated: true },
  cbaScene: { points: [{ country: 'ES', value: -10 }, { country: 'FR', value: 20 }], lines: [cross, outside], coverage: { mapped: 4, reported: 4 } },
};

test('empty country scope restores every cached layer by identity', () => {
  const view = scopeModelCountryView(layers);
  for (const field of ['facilities', 'connections', 'assetsFrame', 'flowFrame', 'cbaScene']) expect(view[field]).toBe(layers[field]);
});

test('one country filters all points and preserves only touching cross-border connections', () => {
  const view = scopeModelCountryView({ ...layers, countries: ['ES'] });
  expect(view.facilities).toEqual([es]);
  expect(view.connections).toEqual([{ ...cross, coordinates: [[-3, 40], [2, 45]] }]);
  expect(view.assetsFrame.markers.map(marker => marker.nodes.map(node => node.country))).toEqual([['ES']]);
  expect(view.assetsFrame.markers[0].objects[0].measurement).toEqual({ value: 20, unit: 'MW' });
  expect(view.assetsFrame.maximum).toBe(20);
  expect(view.assetsFrame.selectedId).toBe('');
  expect(view.flowFrame.lines).toEqual([{ ...cross, value: 4 }]);
  expect(view.flowFrame.maximum).toBe(4);
  expect(view.flowFrame.selectedId).toBe('');
  expect(view.flowFrame.animated).toBe(true);
  expect(view.cbaScene.points).toEqual([{ country: 'ES', value: -10 }]);
  expect(view.cbaScene.lines).toEqual([cross]);
  expect(view.cbaScene.coverage).toEqual({ mapped: 2, reported: 4, excludedByCountry: 2 });
});

test('multiple countries keep their measurements, without mutating unfiltered data', () => {
  const before = JSON.stringify(layers);
  const view = scopeModelCountryView({ ...layers, countries: ['es', 'FR'] });
  expect(view.facilities).toEqual([es, fr]);
  expect(view.assetsFrame.markers).toHaveLength(2);
  expect(view.assetsFrame.maximum).toBe(90);
  expect(view.assetsFrame.selectedId).toBe('plant-fr');
  expect(view.connections.map(line => line.id)).toEqual([cross.id, outside.id]);
  expect(JSON.stringify(layers)).toBe(before);
});

test('a newly loaded result node is filtered by published country, not its ID spelling', () => {
  const view = scopeModelCountryView({ ...layers, countries: ['ES'], facilities: [es,
    { id: 'result-extra', country: 'FR', atlas_result_value: 7 },
    { id: 'not-prefixed', country: 'ES', atlas_result_value: 3 },
    { id: 'ES-apparent-prefix-with-no-country', atlas_result_value: 9 }] });
  expect(view.facilities.map(node => node.id)).toEqual([es.id, 'not-prefixed']);
});

test('canonical memberships resolve asset nodes without country metadata', () => {
  const anchor = { id: 'encoded-asset-anchor', name: 'No prefix match', position: { ...es.position, canonical_reference: es.id } };
  const frame = modelAssetFrame([{ id: 'g', nodes: [anchor] }], new Map(), 'Objects');
  const view = scopeModelCountryView({ ...layers, countries: ['ES'], assetsFrame: frame });
  expect(view.assetsFrame.markers).toHaveLength(1);
  expect(view.assetsFrame.markers[0].objects[0].id).toBe('g');
});

test('Gas Node result bubbles inherit country scope from their resolved canonical node', () => {
  const gas = { id: 'Gas Node:market', canonical_reference: es.id, latitude: 40, longitude: -3,
    atlas_result_value: 9, atlas_result_map_mode: 'bubbles' };
  const foreign = { ...gas, id: 'Gas Node:foreign', canonical_reference: fr.id };
  const unknown = { ...gas, id: 'Gas Node:unknown', canonical_reference: 'Node:missing' };
  const view = scopeModelCountryView({ ...layers, countries: ['ES'], facilities: [es, gas, foreign, unknown] });
  expect(view.facilities.map(node => node.id)).toEqual([es.id, gas.id]);
  expect(view.facilities[1].atlas_result_value).toBe(9);
});

test('co-located tooltips do not retain objects outside the selected country', () => {
  const group = [es, fr];
  const view = scopeModelCountryView({ ...layers, countries: ['ES'], facilities: [
    { ...es, sameLocationFacilities: group, sameLocationCount: 2 }, { ...fr, sameLocationFacilities: group, sameLocationCount: 2 },
  ] });
  expect(view.facilities[0].sameLocationFacilities).toEqual([es]);
  expect(view.facilities[0].sameLocationCount).toBe(1);
  expect(group).toEqual([es, fr]);
});

test('ambiguous names and missing memberships cannot invent a country match', () => {
  const nodes = [{ ...es, name: 'shared' }, { ...fr, name: 'shared' }];
  const view = scopeModelCountryView({ countries: ['ES'], sourceNodes: nodes,
    facilities: [{ id: 'anchor', name: 'shared' }], connections: [{ id: 'unknown', from: 'shared', to: 'missing' }] });
  expect(view.facilities).toEqual([]);
  expect(view.connections).toEqual([]);
});

test('border line geometry remains drawable when the outside endpoint bubble is removed', () => {
  const line = { id: cross.id, from: es.id, to: fr.id };
  const view = scopeModelCountryView({ ...layers, countries: ['ES'], connections: [line] });
  expect(view.facilities.map(node => node.id)).toEqual([es.id]);
  expect(view.connections[0].coordinates).toEqual([[-3, 40], [2, 45]]);
  expect(line.coordinates).toBeUndefined();
});

test('published routed border geometry is preserved exactly', () => {
  const line = { ...cross, coordinates: [[-3, 40], [-1, 44], [2, 45]] };
  const view = scopeModelCountryView({ ...layers, countries: ['ES'], connections: [line] });
  expect(view.connections[0]).toBe(line);
});
