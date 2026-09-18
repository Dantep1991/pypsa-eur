import { stitchElectricityCrossBorderConnections } from './crossBorderNetwork';

const bus = (country, id, longitude, latitude) => ({
  id,
  name: id,
  component_type: 'Bus',
  sourceCountryCode: country,
  country,
  longitude,
  latitude,
});

const edge = (overrides = {}) => ({
  id: 'raw-1',
  source_id: 'raw-1',
  type: 'line',
  bus0: 'raw-fr',
  bus1: 'raw-be',
  country0: 'FR',
  country1: 'BE',
  longitude0: 2.8,
  latitude0: 50.0,
  longitude1: 3.0,
  latitude1: 50.7,
  s_nom: 1000,
  voltage: 380,
  circuits: 1,
  length: 100,
  ...overrides,
});

test('stitches a border edge between countries using different active resolutions', () => {
  const facilities = [
    bus('FR', 'fr-nuts3-north', 2.7, 49.9),
    bus('FR', 'fr-nuts3-south', 2.0, 44.0),
    bus('BE', 'be-bidding-zone', 4.4, 50.8),
  ];
  const result = stitchElectricityCrossBorderConnections(
    [{ id: 'inside-fr' }],
    facilities,
    [edge()],
    [{ countryCode: 'FR', resolutionKey: 'nuts3' }, { countryCode: 'BE', resolutionKey: 'bidding_zone' }],
  );
  expect(result).toHaveLength(2);
  expect(result[1]).toMatchObject({
    from: 'fr-nuts3-north',
    to: 'be-bidding-zone',
    is_cross_border: true,
    is_cross_border_bridge: true,
    s_nom: 1000,
  });
});

test('aggregates parallel source branches after snapping to cluster nodes', () => {
  const facilities = [bus('FR', 'fr-zone', 2.7, 49.9), bus('BE', 'be-zone', 4.4, 50.8)];
  const result = stitchElectricityCrossBorderConnections(
    [],
    facilities,
    [edge(), edge({ id: 'raw-2', source_id: 'raw-2', s_nom: 500, circuits: 2 })],
    [{ countryCode: 'FR' }, { countryCode: 'BE' }],
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ source_edge_count: 2, s_nom: 1500, circuits: 3 });
});

test('keeps a one-hop border stub when only one side is loaded', () => {
  const result = stitchElectricityCrossBorderConnections(
    [],
    [bus('FR', 'fr-zone', 2.7, 49.9)],
    [edge()],
    [{ countryCode: 'FR' }],
  );
  expect(result).toHaveLength(1);
  expect(result[0].from).toBe('fr-zone');
  expect(result[0].coordinates[1]).toEqual([3, 50.7]);
});

test('rebuild removes obsolete bridges and cross-border catalogue edges', () => {
  const result = stitchElectricityCrossBorderConnections(
    [
      { id: 'inside-fr' },
      { id: 'old-bridge', is_cross_border_bridge: true },
      { id: 'old-reference', is_reference_topology: true, is_cross_border: true },
      { id: 'internal-reference', is_reference_topology: true, is_cross_border: false },
    ],
    [bus('FR', 'fr-zone', 2.7, 49.9), bus('BE', 'be-zone', 4.4, 50.8)],
    [edge()],
    [{ countryCode: 'FR' }, { countryCode: 'BE' }],
  );
  expect(result.map((item) => item.id)).toEqual([
    'inside-fr',
    'internal-reference',
    'cross-border-line-BE:be-zone--FR:fr-zone',
  ]);
});
