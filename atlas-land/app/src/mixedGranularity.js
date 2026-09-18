export const MIXED_GRANULARITY_DEFAULTS = Object.freeze({
  focus: 'full',
  adjacent: 'nuts3',
  outer: 'bidding_zone',
});

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

export function buildMixedGranularityPlan(focusCountryCode, availableCountryCodes, levels = {}) {
  const focusCode = String(focusCountryCode || '').trim().toUpperCase();
  const available = cleanCodes(availableCountryCodes);
  if (!focusCode || !available.has(focusCode)) {
    throw new Error('Choose a focus country with a local network cache.');
  }

  const resolvedLevels = { ...MIXED_GRANULARITY_DEFAULTS, ...levels };
  const adjacent = [...(TSO_INTERCONNECTION_GRAPH.get(focusCode) || [])]
    .filter((code) => available.has(code))
    .sort();
  const occupied = new Set([focusCode, ...adjacent]);
  const outer = [...new Set(adjacent.flatMap((code) => [
    ...(TSO_INTERCONNECTION_GRAPH.get(code) || []),
  ]))]
    .filter((code) => available.has(code) && !occupied.has(code))
    .sort();

  const countries = [
    { countryCode: focusCode, ring: 'focus', resolution: resolvedLevels.focus },
    ...adjacent.map((countryCode) => ({ countryCode, ring: 'adjacent', resolution: resolvedLevels.adjacent })),
    ...outer.map((countryCode) => ({ countryCode, ring: 'outer', resolution: resolvedLevels.outer })),
  ];
  return {
    focusCode,
    levels: resolvedLevels,
    adjacent,
    outer,
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
