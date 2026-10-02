import { bindAggregationCatalog, buildModelAggregation, reapplyModelAggregation, projectAggregatedFlowFrame, projectAggregatedAssetFrame, regionAssignment, GEOGRAPHY_LEVELS } from './modelAggregation';

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

test('official regions reject overlapping membership and retain other countries', () => {
  expect(() => regionAssignment(catalog, 'official', ['south', 'north'], ['FR'])).toThrow(/overlap/);
  expect(() => regionAssignment(catalog, 'official', ['invented'], ['FR'])).toThrow(/Unknown/);
  const preview = buildModelAggregation(scene(), 'regional', { schemeId: 'official', regionIds: ['south'] });
  const region = preview.facilities.find(item => item.name === 'South');
  expect(region.atlas_source_count).toBe(3);
  expect(region.atlas_aggregation_countries).toEqual(['FR', 'ES']);
  expect(preview.facilities.find(item => item.name === 'BE').atlas_resolution_tier).toBe('country');
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
