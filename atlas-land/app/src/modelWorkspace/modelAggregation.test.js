import { bindAggregationCatalog, buildModelAggregation, modelAggregationRegions, reapplyModelAggregation, projectAggregatedFlowFrame, projectAggregatedAssetFrame, regionAssignment, GEOGRAPHY_LEVELS } from './modelAggregation';
import { indexGenerationSites } from '../generationMapLayout';
import { modelAssetFrame } from './modelAssets';

const node = (name, country, bz, lat, lon) => ({ id: `Node:${name}`, name, component_type: 'Bus', country,
  bidding_zone: bz, latitude: lat, longitude: lon });
const link = (id, from, to, capacity, unit = 'MW') => ({ id, from, to, fromNode: from, toNode: to,
  p_nom: capacity, capacity_units: unit, component_type: 'Line', carrier: 'electricity', category: 'Existing' });
const catalog = { schema: 'nohm.atlas.aggregation-catalog.v1', project_id: 'Example', model_version: 'v1',
  native_resolution: 'ehighway', node_mapping: {}, regional_registry: { schemes: [{ id: 'official', regions: [
    { id: 'south', name: 'South', countries: ['FR', 'ES'] }, { id: 'north', name: 'North', countries: ['FR', 'BE'] },
  ] }] } };
const scene = () => ({ meta: { projectId: 'Example', version: 'v1', countries: ['FR', 'ES', 'BE'], aggregationCatalog: catalog },
  facilities: [node('F1', 'FR', 'FR00', 46, 2), node('F2', 'FR', 'FR00', 48, 4), node('E1', 'ES', 'ES00', 40, -4),
    node('B1', 'BE', 'BE00', 50, 4), node('Unknown', '', '', 60, 5),
    { id: 'Generator:plant', component_type: 'Generator', bus: 'Node:F1', p_nom: 100, latitude: 46, longitude: 2 }],
  connections: [link('internal', 'Node:F1', 'Node:F2', 70), link('out1', 'Node:F1', 'Node:E1', 30),
    link('out2', 'Node:E1', 'Node:F2', 20), link('gas-unit', 'Node:F1', 'Node:E1', 40, 'GWh'),
    link('unknown-capacity', 'Node:F1', 'Node:B1', null), link('dangling', 'Node:F1', 'Node:no-coordinates', 99)] });

test('declared hierarchy is stable and finer levels cannot be manufactured', () => {
  expect(GEOGRAPHY_LEVELS.map(([id]) => id)).toEqual(['full', 'nuts3', 'nuts2', 'nuts1', 'ehighway', 'bidding_zone', 'country', 'regional']);
  expect(() => buildModelAggregation(scene(), 'nuts3')).toThrow(/finer/);
  const source = scene(); source.meta.aggregationCatalog = { ...catalog, native_resolution: 'country' };
  expect(() => buildModelAggregation(source, 'bidding_zone')).toThrow(/finer/);
});

test('mixed regions never absorb finer countries, and missing memberships remain explicit', () => {
  const source = scene(), snapshot = JSON.stringify(source);
  const preview = buildModelAggregation(source, 'mixed', { resolutionByCountry: { FR: 'native', ES: 'regional', BE: 'regional' },
    schemeId: 'official', regionIds: ['south', 'north'] });
  const buses = preview.facilities.filter(item => item.component_type === 'Bus');
  expect(buses.find(item => item.id === 'Node:F1').atlas_source_ids).toEqual(['Node:F1']);
  expect(buses.find(item => item.name === 'South').atlas_source_ids).toEqual(['Node:E1']);
  expect(buses.find(item => item.name === 'North').atlas_source_ids).toEqual(['Node:B1']);
  expect(buses.find(item => item.id === 'Node:Unknown')).toBeDefined();
  expect(preview.facilities.find(item => item.id === 'Generator:plant').p_nom).toBe(100);
  expect(JSON.stringify(source)).toBe(snapshot);
  const restored = reapplyModelAggregation(source, preview);
  expect(restored.facilities.map(item => item.id)).toEqual(preview.facilities.map(item => item.id));
});

test('a mixed regional tier leaves unselected countries at country level', () => {
  const preview = buildModelAggregation(scene(), 'mixed', { resolutionByCountry: { FR: 'native', ES: 'regional', BE: 'regional' },
    schemeId: 'official', regionIds: ['south'] });
  expect(preview.facilities.find(item => item.name === 'BE')).toMatchObject({ atlas_resolution_tier: 'country' });
  expect(() => buildModelAggregation(scene(), 'mixed', { resolutionByCountry: { ES: 'regional' },
    schemeId: 'official', regionIds: ['bad'] })).toThrow(/Unknown region/);
});

test('regional boundaries include only actual model countries and do not mutate the published registry', () => {
  const source = scene();
  source.meta.aggregationCatalog = { ...catalog, regional_registry: { schemes: [{ id: 'official', regions: [
    { id: 'south', name: 'South', countries: ['FR', 'ES', 'PT'] },
  ] }] } };
  const before = JSON.stringify(source);
  const preview = buildModelAggregation(source, 'regional', { schemeId: 'official', regionIds: ['south'] });
  expect(modelAggregationRegions(preview)).toEqual([{ id: 'south', name: 'South', countryCodes: ['ES', 'FR'] }]);
  expect(JSON.stringify(source)).toBe(before);
  expect(modelAggregationRegions(buildModelAggregation(source, 'country'))).toEqual([]);
  expect(modelAggregationRegions(null)).toEqual([]);
});

test('mixed-regional boundaries exclude finer countries and preserve each distinct group', () => {
  const preview = buildModelAggregation(scene(), 'mixed', { resolutionByCountry: { FR: 'native', ES: 'regional', BE: 'regional' },
    schemeId: 'official', regionIds: ['south', 'north'] });
  expect(modelAggregationRegions(preview)).toEqual([
    { id: 'north', name: 'North', countryCodes: ['BE'] },
    { id: 'south', name: 'South', countryCodes: ['ES'] },
  ]);
});

test('overlapping regional boundaries share their combined identity without duplicate country polygons', () => {
  const preview = buildModelAggregation(scene(), 'regional', { schemeId: 'official', regionIds: ['south', 'north'] });
  expect(modelAggregationRegions(preview)).toEqual([
    { id: 'combined:["north","south"]', name: 'North + South', countryCodes: ['BE', 'ES', 'FR'] },
  ]);
});

test('version-bound binding retains exact country aliases and rejects foreign metadata', () => {
  const source = scene(); source.facilities[0].country = 'UK';
  expect(bindAggregationCatalog(source, { ...catalog, node_mapping: { 'Node:F1': { country: 'GB', bidding_zone: 'UK00' } } }).facilities[0].country).toBe('GB');
  expect(() => bindAggregationCatalog(source, { ...catalog, model_version: 'v2' })).toThrow(/another project or version/);
  expect(bindAggregationCatalog(source, { ...catalog, node_mapping: { 'Node:F1': { country: null, country_ambiguous: true } } }).facilities[0].country).toBe('');
  source.facilities[0].country = 'DB';
  expect(bindAggregationCatalog(source, { ...catalog, country_codes: ['FR', 'BE', 'ES'] }).facilities[0].country).toBe('');
});

test.each(['bidding_zone', 'country'])('%s preserves members, unknown nodes, capacities and input assets', level => {
  const source = scene(), before = JSON.stringify(source), preview = buildModelAggregation(source, level);
  const buses = preview.facilities.filter(item => item.component_type === 'Bus');
  expect(buses).toHaveLength(4);
  expect(buses.find(item => item.atlas_source_count === 2)).toMatchObject({ latitude: 47, longitude: 3 });
  expect(preview.meta.preview.missingMappings).toEqual(['Node:Unknown']);
  expect(preview.meta.preview.internalized.map(line => line.id)).toEqual(['internal']);
  expect(preview.meta.preview.unmapped).toEqual(['dangling']);
  const parallel = preview.connections.find(item => item.atlas_source_count === 2);
  expect(parallel.p_nom).toBe(50);
  expect(Object.values(parallel.atlas_source_directions).sort()).toEqual([-1, 1]);
  expect(preview.connections.find(item => item.atlas_source_ids.includes('unknown-capacity')).p_nom).toBeNull();
  expect(preview.connections.find(item => item.capacity_units === 'GWh').p_nom).toBe(40);
  expect(preview.facilities.find(item => item.id === 'Generator:plant')).toMatchObject({ p_nom: 100, latitude: 47, longitude: 3 });
  expect(JSON.stringify(source)).toBe(before);
  expect(buses.reduce((sum, bus) => sum + bus.atlas_source_count, 0)).toBe(5);
});

test('published overlaps become a visual union without duplicating countries or changing the registry', () => {
  const before = JSON.stringify(catalog);
  const combined = regionAssignment(catalog, 'official', ['south', 'north'], ['FR', 'ES', 'BE']);
  expect(combined.size).toBe(3);
  expect(new Set(combined.values()).size).toBe(1);
  expect(combined.get('FR').visual_union).toBe(true);
  expect(regionAssignment(catalog, 'official', ['north', 'south'], ['FR', 'ES', 'BE']).get('FR')).toEqual(combined.get('FR'));
  expect(JSON.stringify(catalog)).toBe(before);
  expect(() => regionAssignment(catalog, 'official', ['invented'], ['FR'])).toThrow(/Unknown/);
  const preview = buildModelAggregation(scene(), 'regional', { schemeId: 'official', regionIds: ['south'] });
  const region = preview.facilities.find(item => item.name === 'South');
  expect(region.atlas_source_count).toBe(3);
  expect(region.atlas_aggregation_countries).toEqual(['FR', 'ES']);
  expect(preview.facilities.find(item => item.name === 'BE').atlas_resolution_tier).toBe('country');
});

test('a bridging region joins overlapping groups transitively and preserves every native node once', () => {
  const source = scene();
  source.meta.aggregationCatalog = { ...catalog, regional_registry: { schemes: [{ id: 'official', regions: [
    { id: 'a', name: 'A', countries: ['FR'] }, { id: 'b', name: 'B', countries: ['BE'] },
    { id: 'bridge', name: 'Bridge', countries: ['FR', 'ES', 'BE'] },
  ] }] } };
  const preview = buildModelAggregation(source, 'regional', { schemeId: 'official', regionIds: ['a', 'b', 'bridge'] });
  const buses = preview.facilities.filter(item => item.component_type === 'Bus');
  expect(buses).toHaveLength(2);
  expect(buses.reduce((sum, bus) => sum + bus.atlas_source_count, 0)).toBe(5);
});

test('net flows conserve signed exchange and keep internal and native pipeline evidence separate', () => {
  const frame = { selectedId: 'out2', animated: true, lines: [
    { id: 'out1', actualFrom: 'F1', actualTo: 'E1', value: 10, class_name: 'Line', category: 'Existing', unit: 'GWh', metrics: { capacity: 30 }, color: '#f97316' },
    { id: 'out2', actualFrom: 'E1', actualTo: 'F2', value: 4, class_name: 'Line', category: 'Existing', unit: 'GWh' },
    { id: 'internal', actualFrom: 'F1', actualTo: 'F2', value: 999, class_name: 'Line', unit: 'GWh' },
    { id: 'pipeline', actualFrom: 'F1', actualTo: 'E1', value: 5, class_name: 'Gas Pipeline', unit: 'GWh' },
  ] };
  const before = JSON.stringify(frame), result = projectAggregatedFlowFrame(frame, buildModelAggregation(scene(), 'country'));
  expect(result.lines).toHaveLength(2);
  const aggregated = result.lines.find(line => line.aggregated);
  expect(aggregated).toMatchObject({ value: 6, actualFrom: 'FR', actualTo: 'ES', sourceIds: ['out1', 'out2'], metrics: null });
  expect(result.selectedId).toBe(aggregated.id);
  expect(result.internalized).toEqual(['internal']);
  expect(result.lines.find(line => line.id === 'pipeline')).toBe(frame.lines[3]);
  expect(JSON.stringify(frame)).toBe(before);
});

test('asset markers follow their declared buses, without inventing results or capacities', () => {
  const frame = { markers: [{ id: 'plant', nodes: [{ id: 'Node:F1' }], position: [46, 2], value: 100 }] };
  expect(projectAggregatedAssetFrame(frame, buildModelAggregation(scene(), 'country')).markers[0]).toMatchObject({ id: 'plant', position: [47, 3], value: 100 });
});

test('Supply combines all native sites at the projected geography, with readable labels and source lineage', () => {
  const source = scene();
  source.facilities.at(-1).locationKey = 'native-one';
  source.facilities.push({ ...source.facilities.at(-1), id: 'Generator:second', bus: 'Node:F2',
    locationKey: 'native-two', p_nom: 200 });
  const preview = buildModelAggregation(source, 'country');
  const sites = indexGenerationSites(preview.facilities);
  expect(sites).toHaveLength(1);
  expect(sites[0].capacityTotal).toBe(300);
  expect(sites[0].generators[0]).toMatchObject({ bus_label: 'FR', source_bus: 'Node:F1' });
  expect(source.facilities.at(-1).locationKey).toBe('native-two');
});

test('Model database merges projected marker locations without summing non-additive asset values', () => {
  const objects = ['F1', 'F2'].map((name, i) => ({ id: `g${i}`, name, nodes: [{ id: `Node:${name}`, name,
    position: { lat: 46 + i * 2, lon: 2 + i * 2 } }] }));
  const frame = modelAssetFrame(objects, new Map([['g0', { value: 100, unit: 'EUR/MWh' }], ['g1', { value: 200, unit: 'EUR/MWh' }]]));
  const projected = projectAggregatedAssetFrame(frame, buildModelAggregation(scene(), 'country'));
  expect(projected.markers).toHaveLength(1);
  expect(projected.markers[0]).toMatchObject({ measured: 2, maximum: 200, position: [47, 3] });
  expect(projected.markers[0].objects.map(obj => obj.measurement.value)).toEqual([100, 200]);
  expect(frame.markers).toHaveLength(2);
});

test('database schema IDs and canonical gas display anchors join the same geography as Supply', () => {
  const objects = ['F1', 'F2'].map((name, i) => ({ id: `g${i}`, nodes: [
    { id: JSON.stringify(['GasNode', 'Market', `${name}gas`]), class_name: 'GasNode', name: `${name}gas`,
      position: { lat: 46 + i * 2, lon: 2 + i * 2, canonical_reference: `Node:${name}` } },
    { id: JSON.stringify(['Node', 'Electricity', name]), class_name: 'Node', name,
      position: { lat: 46 + i * 2, lon: 2 + i * 2 } },
  ] }));
  const frame = modelAssetFrame(objects, new Map([['g0', { value: 100, unit: 'MW' }], ['g1', { value: 200, unit: 'MW' }]]));
  const projected = projectAggregatedAssetFrame(frame, buildModelAggregation(scene(), 'country'));
  expect(projected.markers).toHaveLength(1);
  expect(projected.markers[0].nodes).toHaveLength(1);
  expect(projected.markers[0].nodes[0].name).toBe('FR');
  expect(projected.markers[0].objects).toHaveLength(2);
});

test('mixed views reapply their choices and preserve signed result interfaces', () => {
  const source = scene(), options = { resolutionByCountry: { ES: 'native', FR: 'bidding_zone', BE: 'country' } };
  const preview = buildModelAggregation(source, 'mixed', options);
  const restored = reapplyModelAggregation(source, preview);
  expect(restored.aggregation.options).toEqual(options);
  expect(preview.aggregation.nodeMap.get('Node:E1').id).toBe('Node:E1');
  expect(preview.aggregation.nodeMap.get('Node:F1').id).toBe(preview.aggregation.nodeMap.get('Node:F2').id);
  const frame = { lines: [
    { id: 'forward', class_name: 'Line', actualFrom: 'F1', actualTo: 'E1', value: 10, unit: 'MW', category: 'Existing' },
    { id: 'reverse', class_name: 'Line', actualFrom: 'E1', actualTo: 'F2', value: 4, unit: 'MW', category: 'Existing' }], selectedId: 'forward' };
  expect(projectAggregatedFlowFrame(frame, preview).lines[0]).toMatchObject({ value: 6, sourceIds: ['forward', 'reverse'] });
});

test('mixed projection also refuses a finer bidding-zone split', () => {
  const source = scene(); source.meta.aggregationCatalog = { ...catalog, native_resolution: 'country' };
  expect(() => buildModelAggregation(source, 'mixed', { resolutionByCountry: { FR: 'bidding_zone' } })).toThrow(/finer/);
});

test('layer reloads preserve the selected geography but a different model version cannot inherit it', () => {
  const previous = buildModelAggregation(scene(), 'regional', { schemeId: 'official', regionIds: ['south'] });
  const source = scene(); source.facilities[source.facilities.length - 1].p_nom = 200;
  const next = reapplyModelAggregation(source, previous);
  expect(next.aggregation.level).toBe('regional');
  expect(next.facilities.find(item => item.id === 'Generator:plant').p_nom).toBe(200);
  expect(next.facilities.find(item => item.name === 'South').atlas_source_count).toBe(3);
  source.meta.version = 'v2';
  expect(reapplyModelAggregation(source, previous)).toBeNull();
});

test('capacity highlighting on a grouped interface explicitly describes member evidence, not a new limit', () => {
  const frame = { lines: [{ id: 'line', actualFrom: 'F1', actualTo: 'E1', value: 100, class_name: 'Line', unit: 'MW', color: '#F2A65A', utilisation: 1 }] };
  const line = projectAggregatedFlowFrame(frame, buildModelAggregation(scene(), 'country')).lines[0];
  expect(line.color).toBe('#F2A65A');
  expect(line.capacityNote).toMatch(/limits apply to members/);
  expect(line.utilisation).toBeNull();
});
