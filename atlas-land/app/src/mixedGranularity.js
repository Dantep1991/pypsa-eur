export const MIXED_GRANULARITY_DEFAULTS = Object.freeze({
  focus: 'full',
  adjacent: 'nuts3',
  outer: 'bidding_zone',
  periphery: 'bidding_zone',
  remaining: 'bidding_zone',
});

export const MIXED_GRANULARITY_SCOPES = Object.freeze(['two_hops', 'three_hops', 'full']);

export const ATLAS_COUNTRY_RESOLUTIONS = Object.freeze([
  'bidding_zone', 'ehighway', 'nuts1', 'nuts2', 'nuts3', 'full',
]);

// An explicit resolution on "add France" belongs to France alone. Existing
// countries retain their own cached topology unless the request also sets an
// other-country resolution. Validate the entire plan before loading anything.
export function planCountryResolutionUpdate({
  existingNetworks = [], requestedCountryCodes = [], mode = 'replace',
  resolution = '', otherResolution = '', resolutionsByCountry = {},
  fallbackResolution = 'nuts3',
}) {
  const requested = [...new Set(requestedCountryCodes.map((code) => String(code || '').trim().toUpperCase()))]
    .filter(Boolean);
  if (!requested.length) throw new Error('No country was provided.');
  const existing = new Map(existingNetworks.map((network) => [network.countryCode, network]));
  const codes = mode === 'add'
    ? [...new Set([...existing.keys(), ...requested])]
    : requested;
  const overrides = Object.fromEntries(Object.entries(resolutionsByCountry || {})
    .map(([code, level]) => [String(code).trim().toUpperCase(), level]));
  for (const code of Object.keys(overrides)) {
    if (!codes.includes(code)) throw new Error(`Resolution override for ${code} is outside the selected countries.`);
  }
  const valid = (level) => !level || ATLAS_COUNTRY_RESOLUTIONS.includes(level);
  if (![resolution, otherResolution, fallbackResolution, ...Object.values(overrides)].every(valid)) {
    throw new Error('Choose Bidding zone, e-Highway, NUTS1, NUTS2, NUTS3, or Full / Nodal for each country.');
  }
  return codes.map((countryCode) => {
    const prior = existing.get(countryCode);
    const desired = overrides[countryCode]
      || (requested.includes(countryCode) ? resolution : otherResolution)
      || prior?.resolutionKey
      || fallbackResolution;
    return {
      countryCode,
      resolution: desired,
      changed: !prior || prior.resolutionKey !== desired,
    };
  });
}

// The rings follow electrical interconnection rather than only land borders.
// That makes the preset useful to island and coastal TSOs as well (for example,
// Great Britain includes its HVDC neighbours). Pairs are deliberately stored
// once and expanded into a symmetric graph below.
export const TSO_INTERCONNECTION_PAIRS = Object.freeze([
  ['AL', 'GR'], ['AL', 'ME'], ['AL', 'MK'], ['AL', 'XK'],
  ['AT', 'CH'], ['AT', 'CZ'], ['AT', 'DE'], ['AT', 'HU'], ['AT', 'IT'], ['AT', 'SI'], ['AT', 'SK'],
  ['BA', 'HR'], ['BA', 'ME'], ['BA', 'RS'],
  ['BE', 'DE'], ['BE', 'FR'], ['BE', 'GB'], ['BE', 'LU'], ['BE', 'NL'],
  ['BG', 'GR'], ['BG', 'MK'], ['BG', 'RO'], ['BG', 'RS'],
  ['CH', 'DE'], ['CH', 'FR'], ['CH', 'IT'],
  ['CZ', 'DE'], ['CZ', 'PL'], ['CZ', 'SK'],
  ['DE', 'DK'], ['DE', 'FR'], ['DE', 'LU'], ['DE', 'NL'], ['DE', 'NO'], ['DE', 'PL'], ['DE', 'SE'],
  ['DK', 'GB'], ['DK', 'NL'], ['DK', 'NO'], ['DK', 'SE'],
  ['EE', 'FI'], ['EE', 'LV'],
  ['ES', 'FR'], ['ES', 'PT'],
  ['FI', 'NO'], ['FI', 'SE'],
  ['FR', 'GB'], ['FR', 'IT'], ['FR', 'LU'],
  ['GB', 'IE'], ['GB', 'NL'], ['GB', 'NO'],
  ['GR', 'IT'], ['GR', 'MK'],
  ['HR', 'HU'], ['HR', 'ME'], ['HR', 'RS'], ['HR', 'SI'],
  ['HU', 'RO'], ['HU', 'RS'], ['HU', 'SI'], ['HU', 'SK'],
  ['IT', 'ME'], ['IT', 'SI'],
  ['LT', 'LV'], ['LT', 'PL'], ['LT', 'SE'],
  ['ME', 'RS'], ['ME', 'XK'],
  ['MK', 'RS'], ['MK', 'XK'],
  ['NL', 'NO'],
  ['NO', 'SE'],
  ['PL', 'SE'], ['PL', 'SK'],
  ['RO', 'RS'],
  ['RS', 'XK'],
]);

const buildGraph = (pairs) => {
  const graph = new Map();
  pairs.forEach(([left, right]) => {
    if (!graph.has(left)) graph.set(left, new Set());
    if (!graph.has(right)) graph.set(right, new Set());
    graph.get(left).add(right);
    graph.get(right).add(left);
  });
  return graph;
};

export const TSO_INTERCONNECTION_GRAPH = buildGraph(TSO_INTERCONNECTION_PAIRS);

const cleanCodes = (codes) => new Set((codes || [])
  .map((code) => String(code || '').trim().toUpperCase())
  .filter((code) => /^[A-Z]{2}$/.test(code)));

export function buildMixedGranularityPlan(focusCountryCodes, availableCountryCodes, levels = {}, options = {}) {
  const focusCodes = [...cleanCodes(Array.isArray(focusCountryCodes) ? focusCountryCodes : [focusCountryCodes])];
  const available = cleanCodes(availableCountryCodes);
  if (!focusCodes.length || focusCodes.some((code) => !available.has(code))) {
    throw new Error('Choose focus countries with local network caches.');
  }
  const resolvedLevels = { ...MIXED_GRANULARITY_DEFAULTS, ...levels };
  if (Object.values(resolvedLevels).some((level) => !ATLAS_COUNTRY_RESOLUTIONS.includes(level))) {
    throw new Error('Choose a cached network resolution for every TSO ring.');
  }
  const scope = options.scope || 'two_hops';
  if (!MIXED_GRANULARITY_SCOPES.includes(scope)) throw new Error('Choose two rings, three rings, or the full model.');
  const neighboursOf = (code) => [...(TSO_INTERCONNECTION_GRAPH.get(code === 'UK' ? 'GB' : code) || [])]
    .map((neighbour) => neighbour === 'GB' && available.has('UK') && !available.has('GB') ? 'UK' : neighbour);
  const distance = new Map(focusCodes.map((code) => [code, 0]));
  const queue = [...focusCodes];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const code = queue[cursor];
    for (const neighbour of neighboursOf(code)) {
      if (distance.has(neighbour)) continue;
      distance.set(neighbour, distance.get(code) + 1);
      queue.push(neighbour);
    }
  }
  const ring = (depth) => [...distance.entries()]
    .filter(([code, value]) => available.has(code) && value === depth).map(([code]) => code).sort();
  const adjacent = ring(1);
  const outer = ring(2);
  const periphery = ring(3);
  const remaining = [...available].filter((code) => !distance.has(code) || distance.get(code) > 3).sort();
  const rings = { focus: focusCodes, adjacent, outer,
    periphery: scope === 'two_hops' ? [] : periphery,
    remaining: scope === 'full' ? remaining : [] };
  const countries = Object.entries(rings).flatMap(([tier, codes]) => codes.map((countryCode) => ({
    countryCode, ring: tier, resolution: resolvedLevels[tier],
  })));
  const included = new Set(countries.map(({ countryCode }) => countryCode));
  const grouped = new Set();
  const regions = (options.regions || []).map((region, index) => {
    const name = String(region.name || '').trim();
    const countryCodes = [...cleanCodes(region.countryCodes || [])].sort();
    if (!name || countryCodes.length < 2 || countryCodes.some((code) => !included.has(code) || focusCodes.includes(code) || grouped.has(code))) {
      throw new Error(`Region ${index + 1} needs a name and at least two non-focus countries in the selected scope; countries cannot belong to two regions.`);
    }
    countryCodes.forEach((code) => grouped.add(code));
    return { id: `region-${index + 1}`, name, countryCodes };
  });
  const regionByCountry = new Map(regions.flatMap((region) => region.countryCodes.map((code) => [code, region])));
  countries.forEach((country) => {
    const region = regionByCountry.get(country.countryCode);
    if (!region) return;
    country.resolution = 'bidding_zone';
    country.regionId = region.id;
  });
  return {
    focusCode: focusCodes[0],
    focusCodes,
    scope,
    levels: resolvedLevels,
    adjacent,
    outer,
    periphery: rings.periphery,
    remaining: rings.remaining,
    regions,
    countries,
  };
}

export function mixedGranularityResolutionLabel(resolution) {
  return ({
    bidding_zone: 'Bidding',
    ehighway: 'e-Highway',
    nuts1: 'NUTS1',
    nuts2: 'NUTS2',
    nuts3: 'NUTS3',
    full: 'Nodal',
  })[resolution] || resolution;
}
