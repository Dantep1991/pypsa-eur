import { proposeCountryRegions } from './countryRegionAggregation';
import { projectMixedCountryRegions } from './mixedRegionProjection';
const countries = ['AA', 'BB', 'CC', 'DD', 'EE'];
const facilities = countries.map((country, i) => ({ id: country, country, component_type: 'Bus', latitude: i, longitude: i }));
const edge = (a, b, id = `${a}-${b}`) => ({ id, from: a, to: b, type: 'line', carrier: 'AC', s_nom: 100 });
const connections = [edge('AA', 'BB'), edge('BB', 'CC'), edge('CC', 'DD'), edge('BB', 'DD'), edge('DD', 'EE')];
const base = { countries, facilities, connections, maxCountries: 3 };

test('region count emerges automatically while the size limit is always honoured', () => {
  const merged = proposeCountryRegions({ ...base, maxCountries: 5 });
  expect(merged.groups).toEqual([countries]);
  const bounded = proposeCountryRegions({ ...base, maxCountries: 2 });
  expect(bounded.groups.every(group => group.length <= 2)).toBe(true);
  expect(bounded.groups.flat().sort()).toEqual(countries);
  expect(bounded.regions.length).toBeGreaterThan(0);
  expect(() => proposeCountryRegions({ ...base, maxCountries: 1 })).toThrow();
});

test('deterministic, bounded partition preserves every country and protects focus countries', () => {
  const result = proposeCountryRegions({ ...base, protectedCountries: ['AA'] });
  expect([...result.groups.flat(), ...result.protectedCountries].sort()).toEqual(countries);
  expect(result.groups.every(group => group.length <= 3 && !group.includes('AA'))).toBe(true);
  expect(proposeCountryRegions({ ...base, countries: [...countries].reverse(), connections: [...connections].reverse(), protectedCountries: ['AA'] })).toEqual(result);
});

test('automatic mode chooses community sizes without a preset country cap', () => {
  const communityCountries = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF'];
  const communityFacilities = communityCountries.map(country => ({ id: country, country, component_type: 'Bus' }));
  const communityConnections = [
    edge('AA', 'BB'), edge('BB', 'CC'), edge('AA', 'CC'),
    edge('DD', 'EE'), edge('EE', 'FF'), edge('DD', 'FF'), edge('CC', 'DD'),
  ];
  const result = proposeCountryRegions({ countries: communityCountries,
    facilities: communityFacilities, connections: communityConnections });
  expect(result.maxCountriesMode).toBe('automatic');
  expect(result.maxCountriesLimit).toBeNull();
  expect(result.groups).toEqual([['AA', 'BB', 'CC'], ['DD', 'EE', 'FF']]);
  expect(result.largestRegionSize).toBe(3);
  expect(result.interfacesBefore).toBe(7);
  expect(result.interfacesAfter).toBe(1);
});

test('disconnected countries remain separate rather than becoming proposed regions', () => {
  const result = proposeCountryRegions({ ...base, connections: [] });
  expect(result.regions).toEqual([]);
  expect(result.groups).toHaveLength(5);
  expect(result.warnings).toEqual([]);
});

test('parallel lines do not bias country grouping', () => {
  expect(proposeCountryRegions({ ...base, connections: [...connections, ...Array(30).fill(connections[0])] }))
    .toEqual(proposeCountryRegions(base));
});

test('ambiguous identities and other carriers do not fabricate edges', () => {
  const result = proposeCountryRegions({ ...base, facilities: [...facilities, { ...facilities[1], id: 'AA' }],
    connections: [edge('AA', 'CC'), { ...edge('DD', 'EE'), atlas_network_carrier: 'gas' }] });
  expect(result.regions).toEqual([]);
  expect(result.warnings.join(' ')).toContain('endpoints that do not match a loaded bus');
});

test('all external branches survive projection when neighbours connect to multiple members', () => {
  const links = [edge('BB', 'CC'), edge('AA', 'BB'), edge('AA', 'CC'), edge('CC', 'DD'), edge('BB', 'EE')];
  const result = projectMixedCountryRegions(facilities, links, [{ id: 'r', name: 'Region', countryCodes: ['BB', 'CC'] }]);
  expect(result.connections.flatMap(link => link.source_edge_ids || [link.id]).sort())
    .toEqual(links.slice(1).map(link => link.id).sort());
  expect(result.connections).toHaveLength(3);
  expect(result.connections.reduce((sum, link) => sum + link.s_nom, 0)).toBe(400);
  expect(links).toHaveLength(5);
});

test('generated graphs retain connected membership and complete coverage', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const links = countries.flatMap((a, i) => countries.slice(i + 1).filter((b, j) => (seed * (i + 3) + j * 7) % 5 < 2).map(b => edge(a, b)));
    const result = proposeCountryRegions({ ...base, connections: links });
    for (let i = 0; i < result.groups.length; i += 1) {
      for (let j = i + 1; j < result.groups.length; j += 1) {
        const a = result.groups[i]; const b = result.groups[j];
        if (a.length + b.length <= base.maxCountries) {
          expect(links.some(link => (a.includes(link.from) && b.includes(link.to)) || (b.includes(link.from) && a.includes(link.to)))).toBe(false);
        }
      }
    }
    expect(result.groups.flat().sort()).toEqual(countries);
    for (const group of result.groups) {
      const seen = new Set([group[0]]);
      for (let round = 0; round < group.length; round += 1) for (const link of links) {
        if (group.includes(link.from) && group.includes(link.to) && (seen.has(link.from) || seen.has(link.to))) {
          seen.add(link.from); seen.add(link.to);
        }
      }
      expect(seen.size).toBe(group.length);
    }
  }
});

test('projection keeps different carrier interfaces separate', () => {
  const result = projectMixedCountryRegions(facilities,
    [edge('BB', 'AA'), { ...edge('CC', 'AA'), carrier: 'DC' }],
    [{ id: 'r', name: 'Region', countryCodes: ['BB', 'CC'] }]);
  expect(result.connections).toHaveLength(2);
  expect(result.connections.map(link => link.carrier).sort()).toEqual(['AC', 'DC']);
});

test('regional nodes and routes replace inherited cache identities and multipart geometry', () => {
  const source = facilities.map(bus => ({ ...bus, cluster_id: bus.id, is_virtual: true }));
  const result = projectMixedCountryRegions(source,
    [{ ...edge('BB', 'AA'), coordinate_paths: [[[40, 40], [50, 50]]] }],
    [{ id: 'r', name: 'Region', countryCodes: ['BB', 'CC'] }]);
  expect(result.facilities.find(bus => bus.id === 'atlas-region:r')).toMatchObject({ cluster_id: 'atlas-region:r', is_virtual: false });
  expect(result.connections[0].coordinate_paths).toBeUndefined();
  expect(result.connections[0].coordinates).toEqual([[1.5, 1.5], [0, 0]]);
});
