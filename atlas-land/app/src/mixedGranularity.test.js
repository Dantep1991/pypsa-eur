import {
  MIXED_GRANULARITY_DEFAULTS,
  TSO_INTERCONNECTION_GRAPH,
  buildMixedGranularityPlan,
  mixedGranularityResolutionLabel,
} from './mixedGranularity';

test('the TSO interconnection graph is symmetric', () => {
  for (const [country, neighbours] of TSO_INTERCONNECTION_GRAPH) {
    for (const neighbour of neighbours) {
      expect(TSO_INTERCONNECTION_GRAPH.get(neighbour)).toContain(country);
    }
  }
});

test('builds unique focus, adjacent and outer rings using only available caches', () => {
  const available = ['BE', 'DE', 'FR', 'GB', 'LU', 'NL', 'AT', 'CH', 'CZ', 'DK', 'ES', 'IE', 'IT', 'NO', 'PL', 'SE'];
  const plan = buildMixedGranularityPlan('be', available);

  expect(plan.focusCode).toBe('BE');
  expect(plan.levels).toEqual(MIXED_GRANULARITY_DEFAULTS);
  expect(plan.adjacent).toEqual(['DE', 'FR', 'GB', 'LU', 'NL']);
  expect(plan.outer).toEqual(['AT', 'CH', 'CZ', 'DK', 'ES', 'IE', 'IT', 'NO', 'PL', 'SE']);
  expect(new Set(plan.countries.map(({ countryCode }) => countryCode)).size).toBe(plan.countries.length);
  expect(plan.countries[0]).toEqual({ countryCode: 'BE', ring: 'focus', resolution: 'full' });
  expect(plan.countries.find(({ countryCode }) => countryCode === 'FR')).toMatchObject({ ring: 'adjacent', resolution: 'nuts3' });
  expect(plan.countries.find(({ countryCode }) => countryCode === 'ES')).toMatchObject({ ring: 'outer', resolution: 'bidding_zone' });
});

test('supports custom tiers and rejects an unavailable focus country', () => {
  const plan = buildMixedGranularityPlan('ES', ['ES', 'FR', 'PT', 'BE', 'DE'], {
    adjacent: 'nuts2', outer: 'ehighway',
  });
  expect(plan.countries).toEqual([
    { countryCode: 'ES', ring: 'focus', resolution: 'full' },
    { countryCode: 'FR', ring: 'adjacent', resolution: 'nuts2' },
    { countryCode: 'PT', ring: 'adjacent', resolution: 'nuts2' },
    { countryCode: 'BE', ring: 'outer', resolution: 'ehighway' },
    { countryCode: 'DE', ring: 'outer', resolution: 'ehighway' },
  ]);
  expect(() => buildMixedGranularityPlan('XX', ['ES'])).toThrow(/focus country/i);
  expect(mixedGranularityResolutionLabel('full')).toBe('Nodal');
});
