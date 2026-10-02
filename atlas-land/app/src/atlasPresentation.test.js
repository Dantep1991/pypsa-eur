import { assetFacts, candidateSites, coordinate, distanceKm, metricDifference, viewMetrics, nodePortfolio, siteEvidence, nearbyAccess, comparisonWithinBudget } from './atlasPresentation';

const bus = (id, latitude, longitude, extra = {}) => ({ id, latitude, longitude, component_type: 'Bus', ...extra });
test('coordinates never turn missing values into the Gulf of Guinea', () => {
  expect(coordinate(bus('x', null, ''))).toBeNull();
  expect(coordinate(bus('x', 91, 1))).toBeNull();
  expect(coordinate(bus('x', 0, 0))).toEqual([0, 0]);
});
test('site screening preserves scope and excludes synthetic regional nodes', () => {
  const data = [bus('near', 48, 2), bus('far', 52, 6), bus('region', 48, 2, { atlas_visual_aggregation_only: true }),
    bus('gas', 48, 2, { atlas_network_carrier: 'gas' }), bus('virtual', 48, 2, { is_virtual: true }),
    bus('water', 48.01, 2, { atlas_network_carrier: 'water' })];
  const result = candidateSites(data, [48, 2], 50);
  expect(result.map(site => site.item.id)).toEqual(['near']);
  expect(result[0].nearestWater.distance).toBeCloseTo(1.112, 2);
  expect(result[0].nearestWater.name).toBe('water');
  expect(result[0].land).toBeUndefined();
});
test('missing water coverage remains unknown and candidates are bounded', () => {
  const result = candidateSites(Array.from({ length: 15 }, (_, i) => bus(String(i), 48 + i / 1000, 2)), [48, 2], 50);
  expect(result).toHaveLength(6);
  expect(result[0].nearestWater).toBeNull();
  expect(candidateSites([], [48, 2], -1)).toEqual([]);
  expect(distanceKm([48, 2], [48, 2])).toBe(0);
});
test('regional inherited capacities are not reported as regional totals', () => {
  const facts = assetFacts(bus('r', 48, 2, { atlas_region_group_name: 'Region', p_nom: 200, country_codes: ['FR', 'BE'], atlas_source_count: 10 }));
  expect(facts.capacity).toBeNull(); expect(facts.underlying).toBe(10);
  expect(facts.countries).toEqual(['FR', 'BE']);
});
test('inspector resolves incident edges and preserves real zero capacity', () => {
  const facts = assetFacts(bus('a', 48, 2, { p_nom: 0 }), [{ from: 'a', to: 'b' }, { fromNode: 'c', toNode: 'a' }, { from: 'c', to: 'b' }]);
  expect(facts.links).toHaveLength(2); expect(facts.capacity).toBe(0);
});
test('comparison reports actual displayed counts including zero', () => {
  const before = viewMetrics([], []); const after = viewMetrics([bus('a', 48, 2)], []);
  expect(metricDifference(before, after)).toBe('assets: 0 → 1 · links: 0 → 0 · regions: 0 → 0');
});
test('portfolio only totals associated loaded assets and identifies provisional demand', () => {
  const node = bus('a', 48, 2);
  const result = nodePortfolio(node, [node, { id: 'g', bus: 'a', component_type: 'Generator', carrier: 'Solar', p_nom: 50 },
    { id: 'load', bus: 'a', component_type: 'Load', annual_energy_gwh: 100, provisional_demand: true },
    { id: 'other', bus: 'elsewhere', component_type: 'Generator', p_nom: 999 }]);
  expect(result.mix).toEqual([{ carrier: 'Solar', capacity: 50 }]);
  expect(result.demand).toBe(100); expect(result.provisional).toBe(true); expect(result.storage).toBeNull();
});
test('site checks never present missing coverage as clearance', () => {
  expect(siteEvidence({})).toBe('Evidence incomplete');
  const land = { protected: false, land_cover: { label: 'Agriculture' } };
  expect(siteEvidence({ land }, { requireWater: true })).toBe('Evidence incomplete');
  expect(siteEvidence({ land: { ...land, protected: true } })).toMatch(/Protected/);
  expect(siteEvidence({ land, nearestWater: { distance: 30 } }, { requireWater: true, maxWaterKm: 10 })).toMatch(/Outside/);
  expect(siteEvidence({ land })).toMatch(/unverified/);
});
test('access evidence is nearby published data, and missing values are retained', () => {
  const item = { type: 'Feature', geometry: { type: 'Point', coordinates: [2, 48] }, properties: { available_mw: null, queued_mw: 0 } };
  expect(nearbyAccess([48, 2], { features: [item] }).properties).toEqual(item.properties);
  expect(nearbyAccess([52, 6], { features: [item] })).toBeNull();
});
test('oversized comparison is rejected rather than silently truncating routes', () => {
  expect(comparisonWithinBudget({ facilities: [], connections: [{ coordinates: new Array(250001) }] })).toBe(false);
  expect(comparisonWithinBudget({ facilities: [], connections: [] })).toBe(true);
});
