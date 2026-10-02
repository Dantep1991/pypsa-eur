import { projectMixedCountryRegions } from './mixedRegionProjection';

const bus = (id, country, latitude, longitude) => ({
  id, name: id, component_type: 'Bus', atlas_domain: 'Grid',
  country, sourceCountryCode: country, latitude, longitude,
});
const line = (id, from, to, s_nom) => ({
  id, from, to, type: 'line', atlas_domain: 'Grid', s_nom, capacity_units: 'MW',
  coordinates: [[0, 0], [1, 1]],
});

test('aggregates two countries into one visual node and preserves external capacity', () => {
  const facilities = [
    bus('be-1', 'BE', 50, 4), bus('be-2', 'BE', 51, 5),
    bus('nl-1', 'NL', 52, 5), bus('de-1', 'DE', 52, 10),
    { id: 'solar-be', component_type: 'Generator', atlas_domain: 'Supply', carrier: 'solar',
      sourceCountryCode: 'BE', country: 'BE', bus: 'be-1', p_nom: 100, latitude: 50, longitude: 4 },
    { id: 'solar-nl', component_type: 'Generator', atlas_domain: 'Supply', carrier: 'solar',
      sourceCountryCode: 'NL', country: 'NL', bus: 'nl-1', p_nom: 200, latitude: 52, longitude: 5 },
  ];
  const connections = [
    line('internal-be', 'be-1', 'be-2', 100),
    line('internal-border', 'be-2', 'nl-1', 120),
    line('export-be', 'be-1', 'de-1', 150),
    line('export-nl', 'nl-1', 'de-1', 250),
  ];
  const result = projectMixedCountryRegions(facilities, connections, [
    { id: 'region-1', name: 'Benelux', countryCodes: ['BE', 'NL'] },
  ]);
  const region = result.facilities.find(({ id }) => id === 'atlas-region:region-1');
  expect(region).toMatchObject({ name: 'Benelux', atlas_visual_aggregation_only: true,
    latitude: 51.25, longitude: 4.75, atlas_source_count: 3 });
  expect(result.facilities.filter(({ component_type }) => component_type === 'Bus')).toHaveLength(2);
  expect(result.facilities.find(({ component_type }) => component_type === 'Generator').p_nom).toBe(300);
  expect(result.connections).toHaveLength(1);
  expect(result.connections[0]).toMatchObject({ from: region.id, to: 'de-1', s_nom: 400, source_edge_count: 2 });
  expect(result.connections[0].coordinates[0]).toEqual([4.75, 51.25]);
  expect(facilities[0].id).toBe('be-1'); // The source topology is untouched.
});

test('no regions keeps exact source array identity', () => {
  const facilities = [bus('be-1', 'BE', 50, 4)];
  const connections = [];
  expect(projectMixedCountryRegions(facilities, connections)).toEqual({ facilities, connections });
  expect(projectMixedCountryRegions(facilities, connections).facilities).toBe(facilities);
});

test('a partially visible country group is not mislabelled as the whole region', () => {
  const facilities = [bus('be-1', 'BE', 50, 4)];
  const connections = [];
  const result = projectMixedCountryRegions(facilities, connections, [
    { id: 'region-1', name: 'Benelux', countryCodes: ['BE', 'NL'] },
  ]);
  expect(result.facilities).toBe(facilities);
  expect(result.facilities[0].name).toBe('be-1');
});

test('supply-only view keeps regional supply totals without exposing hidden grid buses', () => {
  const reference = [bus('be-1', 'BE', 50, 4), bus('nl-1', 'NL', 52, 5)];
  const supply = [{ id: 'solar-be', component_type: 'Generator', atlas_domain: 'Supply', carrier: 'solar',
    sourceCountryCode: 'BE', country: 'BE', bus: 'be-1', p_nom: 100, latitude: 50, longitude: 4 }];
  const result = projectMixedCountryRegions(supply, [], [
    { id: 'region-1', name: 'Benelux', countryCodes: ['BE', 'NL'] },
  ], reference);
  expect(result.facilities).toHaveLength(1);
  expect(result.facilities[0]).toMatchObject({ component_type: 'Generator', p_nom: 100,
    country: 'Benelux', atlas_visual_aggregation_only: true });
});

test('other carriers are not absorbed into an electricity region in overlay mode', () => {
  const electricity = [bus('be-1', 'BE', 50, 4), bus('nl-1', 'NL', 52, 5)];
  const methane = { ...bus('gas-be', 'BE', 50, 4), atlas_network_carrier: 'gas' };
  const gasLink = { ...line('gas-link', 'gas-be', 'other-gas', 10), atlas_network_carrier: 'gas' };
  const result = projectMixedCountryRegions([...electricity, methane], [gasLink], [
    { id: 'region-1', name: 'Benelux', countryCodes: ['BE', 'NL'] },
  ], electricity);
  expect(result.facilities.find(({ id }) => id === 'gas-be')).toMatchObject({ atlas_network_carrier: 'gas' });
  expect(result.connections[0]).toBe(gasLink);
});
