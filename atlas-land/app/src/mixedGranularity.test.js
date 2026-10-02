import {
  MIXED_GRANULARITY_DEFAULTS,
  TSO_INTERCONNECTION_GRAPH,
  buildMixedGranularityPlan,
  mixedGranularityResolutionLabel,
  planCountryResolutionUpdate,
} from './mixedGranularity';

test('adding France at NUTS2 preserves the other countries at Full', () => {
  expect(planCountryResolutionUpdate({
    existingNetworks: [
      { countryCode: 'ES', resolutionKey: 'full' },
      { countryCode: 'IT', resolutionKey: 'full' },
    ],
    requestedCountryCodes: ['FR'], mode: 'add', resolution: 'nuts2',
    fallbackResolution: 'nuts2',
  })).toEqual([
    { countryCode: 'ES', resolution: 'full', changed: false },
    { countryCode: 'IT', resolution: 'full', changed: false },
    { countryCode: 'FR', resolution: 'nuts2', changed: true },
  ]);
});

test('upgrading existing France never stages other bidding-zone countries at Full', () => {
  expect(planCountryResolutionUpdate({
    existingNetworks: ['BE', 'FR', 'ES'].map(countryCode => ({ countryCode, resolutionKey: 'bidding_zone' })),
    requestedCountryCodes: ['FR'], mode: 'add', resolution: 'full', fallbackResolution: 'full',
  })).toEqual([
    { countryCode: 'BE', resolution: 'bidding_zone', changed: false },
    { countryCode: 'FR', resolution: 'full', changed: true },
    { countryCode: 'ES', resolution: 'bidding_zone', changed: false },
  ]);
});

test('an explicit other-country Full request upgrades existing countries atomically', () => {
  expect(planCountryResolutionUpdate({
    existingNetworks: [
      { countryCode: 'ES', resolutionKey: 'nuts3' },
      { countryCode: 'IT', resolutionKey: 'full' },
    ],
    requestedCountryCodes: ['FR'], mode: 'add', resolution: 'nuts2',
    otherResolution: 'full',
  })).toEqual([
    { countryCode: 'ES', resolution: 'full', changed: true },
    { countryCode: 'IT', resolution: 'full', changed: false },
    { countryCode: 'FR', resolution: 'nuts2', changed: true },
  ]);
});

test('rejects invalid per-country levels before changing the map', () => {
  expect(() => planCountryResolutionUpdate({
    existingNetworks: [{ countryCode: 'ES', resolutionKey: 'full' }],
    requestedCountryCodes: ['FR'], mode: 'add',
    resolutionsByCountry: { FR: 'nuts9' },
  })).toThrow(/Choose Bidding/);
  expect(() => planCountryResolutionUpdate({
    requestedCountryCodes: ['FR'], resolutionsByCountry: { DE: 'full' },
  })).toThrow(/outside the selected countries/);
});

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
  expect(() => buildMixedGranularityPlan('XX', ['ES'])).toThrow(/focus countries/i);
  expect(mixedGranularityResolutionLabel('full')).toBe('Nodal');
});

test('multiple focus countries use shortest electrical distance and can include the full model', () => {
  const available = ['ES', 'PT', 'FR', 'BE', 'DE', 'PL', 'LT', 'LV', 'EE', 'FI', 'SE', 'NO', 'CY'];
  const plan = buildMixedGranularityPlan(['ES', 'EE'], available, {
    adjacent: 'nuts2', outer: 'nuts1', periphery: 'ehighway', remaining: 'bidding_zone',
  }, { scope: 'full' });
  expect(plan.focusCodes).toEqual(['ES', 'EE']);
  expect(plan.adjacent).toEqual(['FI', 'FR', 'LV', 'PT']);
  expect(plan.outer).toContain('BE');
  expect(plan.periphery).toContain('PL');
  expect(plan.countries.map(({ countryCode }) => countryCode).sort()).toEqual([...available].sort());
  expect(plan.countries.find(({ countryCode }) => countryCode === 'CY').resolution).toBe('bidding_zone');
  expect(new Set(plan.countries.map(({ countryCode }) => countryCode)).size).toBe(available.length);
});

test('groups non-focus countries into named visual regions and rejects overlapping groups', () => {
  const available = ['BE', 'FR', 'DE', 'NL', 'LU', 'ES'];
  const plan = buildMixedGranularityPlan('FR', available, {}, {
    scope: 'full', regions: [{ name: 'Benelux', countryCodes: ['BE', 'NL', 'LU'] }],
  });
  expect(plan.regions[0].countryCodes).toEqual(['BE', 'LU', 'NL']);
  expect(plan.countries.filter(({ regionId }) => regionId === 'region-1').map(({ resolution }) => resolution))
    .toEqual(['bidding_zone', 'bidding_zone', 'bidding_zone']);
  expect(() => buildMixedGranularityPlan('FR', available, {}, {
    scope: 'full', regions: [
      { name: 'Benelux', countryCodes: ['BE', 'NL'] },
      { name: 'Lowlands', countryCodes: ['NL', 'LU'] },
    ],
  })).toThrow(/cannot belong to two regions/);
});

test('treats a UK-labelled network cache as Great Britain in electrical rings', () => {
  const plan = buildMixedGranularityPlan('UK', ['UK', 'FR', 'IE', 'NL']);
  expect(plan.adjacent).toEqual(['FR', 'IE', 'NL']);
});
