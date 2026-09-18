import { indexOverviewNodes, selectOverviewNodes } from './overviewNodeSampling';
import { atlasRecordCountryCodes } from './atlasNetworkOverlay';
const node = (id, country, longitude, extra = {}) => ({ id, country, latitude: 50, longitude, ...extra });
const index = nodes => indexOverviewNodes(nodes, atlasRecordCountryCodes);

test('overview retains countries after a dense source-ordered cluster fills the normal budget', () => {
  const nodes = [...Array.from({ length: 2000 }, (_, i) => node(`de-${i}`, 'DE', 10)),
    node('fr', 'FR', 2), node('es', 'ES', -4), node('be', 'BE', 4)];
  const result = selectOverviewNodes(index(nodes), nodes, 180);
  expect(result).toHaveLength(180);
  expect(new Set(result.map(n => n.country))).toEqual(new Set(['DE', 'FR', 'ES', 'BE']));
  expect(result).toContain(nodes[0]);
});

test('spatial coverage retains remote areas within the same country before filling with hubs', () => {
  const nodes = [...Array.from({ length: 500 }, (_, i) => node(`dense-${i}`, 'FR', 2)),
    node('west', 'FR', -5), node('east', 'FR', 8)];
  const selected = selectOverviewNodes(index(nodes), nodes, 20, { zoom: 5 });
  expect(selected).toHaveLength(20); expect(selected).toContain(nodes[500]); expect(selected).toContain(nodes[501]);
  expect(selected).toContain(nodes[0]);
});

test('visible filtering happens before sampling; off-screen high-priority nodes consume no slots', () => {
  const nodes = Array.from({ length: 500 }, (_, i) => node(String(i), 'FR', i < 400 ? -100 : 2));
  expect(selectOverviewNodes(index(nodes), nodes.slice(400), 50)).toEqual(nodes.slice(400, 450));
});

test('selection keeps the existing sample stable and only inserts missing selected nodes', () => {
  const nodes = Array.from({ length: 500 }, (_, i) => node(String(i), 'FR', 2));
  const indexed = index(nodes), base = selectOverviewNodes(indexed, nodes, 20);
  expect(selectOverviewNodes(indexed, nodes, 20, { selectedIds: ['10'] })).toEqual(base);
  const chosen = selectOverviewNodes(indexed, nodes, 20, { selectedIds: ['499'] });
  expect(chosen).toHaveLength(20); expect(chosen).toContain(nodes[499]);
  expect(chosen.filter(n => base.includes(n))).toHaveLength(19);
});

test('selection prefers replacing a duplicated country over its only representative', () => {
  const nodes = [node('a', 'FR', 2), node('b', 'BE', 4), node('c', 'FR', 2), node('selected', 'FR', 2)];
  const selected = selectOverviewNodes(index(nodes), nodes, 3, { selectedIds: ['selected'] });
  expect(selected).toContain(nodes[1]); expect(selected).toContain(nodes[3]); expect(selected).toHaveLength(3);
});

test('carrier allocation keeps a small network visible and preserves country coverage inside each carrier', () => {
  const nodes = [...Array.from({ length: 40 }, (_, i) => node(`p${i}`, i ? 'FR' : 'BE', 2, { atlas_network_carrier: 'electricity' })),
    ...Array.from({ length: 2000 }, (_, i) => node(`g${i}`, i ? 'DE' : 'ES', 10, { atlas_network_carrier: 'gas' }))];
  const selected = selectOverviewNodes(index(nodes), nodes, 200, { balanceCarriers: true });
  expect(selected).toHaveLength(200);
  expect(selected.filter(n => n.atlas_network_carrier === 'electricity').length).toBeGreaterThanOrEqual(30);
  expect(new Set(selected.map(n => n.country))).toEqual(new Set(['BE', 'FR', 'DE', 'ES']));
});

test.each([0, 1, 2, 10, 180])('sampling never exceeds a %i-node budget, even with many selected nodes/carriers', limit => {
  const nodes = Array.from({ length: 500 }, (_, i) => node(String(i), 'FR', 2, { atlas_network_carrier: String(i % 5) }));
  const selected = selectOverviewNodes(index(nodes), nodes, limit, { balanceCarriers: true, selectedIds: nodes.map(n => n.id) });
  expect(selected).toHaveLength(limit); expect(new Set(selected).size).toBe(limit);
});

test('metadata and projection are indexed once; repeated viewport samples do not reread country tags', () => {
  const nodes = Object.freeze(Array.from({ length: 1000 }, (_, i) => Object.freeze(node(String(i), 'FR', i / 100))));
  const countries = jest.fn(atlasRecordCountryCodes), indexed = indexOverviewNodes(nodes, countries);
  const first = selectOverviewNodes(indexed, nodes, 100);
  for (let i = 0; i < 20; i++) expect(selectOverviewNodes(indexed, nodes, 100)).toEqual(first);
  expect(countries).toHaveBeenCalledTimes(1000);
  expect(nodes[0].id).toBe('0');
});

test('small carrier country coverage is reserved before proportional remainder allocation', () => {
  const countries = ['AL', 'AT', 'BA', 'BE', 'BG', 'CH', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT'];
  const nodes = [...Array.from({ length: 5000 }, (_, i) => node(`power${i}`, countries[i % countries.length], 2, { atlas_network_carrier: 'electricity' })),
    ...['gas', 'water', 'liquids', 'logistics'].flatMap(carrier => countries.map(country => node(`${carrier}-${country}`, country, 2, { atlas_network_carrier: carrier })))];
  const chosen = selectOverviewNodes(index(nodes), nodes, 180, { balanceCarriers: true });
  expect(chosen).toHaveLength(180);
  expect(new Set(chosen.map(n => `${n.atlas_network_carrier}:${n.country}`)).size).toBe(100);
});

test('multi-country tags cover both countries and missing tags still receive spatial representation', () => {
  const nodes = [node('border', '', 2, { countries: ['FR', 'BE'] }), node('be', 'BE', 2),
    node('fr', 'FR', 2), node('unknown', '', 20)];
  const chosen = selectOverviewNodes(index(nodes), nodes, 2, { zoom: 4 });
  expect(chosen.map(n => n.id)).toEqual(['border', 'unknown']);
});
