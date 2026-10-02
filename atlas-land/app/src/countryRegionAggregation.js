// Deterministic, topology-only country clustering. Never invent missing edges.
export function proposeCountryRegions({ countries, facilities = [], connections = [], protectedCountries = [], maxCountries = null }) {
  const automaticLimit = maxCountries == null;
  if (!automaticLimit && (!Number.isInteger(maxCountries) || maxCountries < 2)) {
    throw new Error('Choose a maximum of at least two countries per region.');
  }
  const normalizeCode = value => String(value || '').trim().toUpperCase();
  const codes = [...new Set(countries.map(normalizeCode).filter(Boolean))].sort();
  const selected = new Set(codes);
  const protectedSet = new Set(protectedCountries.map(normalizeCode));
  const identities = new Map();
  const identitiesByCountry = new Map();
  const loaded = new Set();
  for (const bus of facilities) {
    if (bus.atlas_network_carrier && bus.atlas_network_carrier !== 'electricity') continue;
    if (bus.is_virtual) continue;
    if (String(bus.component_type || bus.type).toLowerCase() !== 'bus') continue;
    const country = normalizeCode(bus.sourceCountryCode || bus.country);
    if (!selected.has(country)) continue;
    loaded.add(country);
    if (!identitiesByCountry.has(country)) identitiesByCountry.set(country, new Set());
    for (const id of [bus.id, bus.name, bus.nodeId].filter(value => value != null)) {
      const key = String(id).trim();
      if (!key) continue;
      identitiesByCountry.get(country).add(key);
      if (!identities.has(key)) identities.set(key, new Set());
      identities.get(key).add(country);
    }
  }
  const pairs = new Map();
  let unresolved = 0;
  for (const edge of connections) {
    if (edge.atlas_network_carrier && edge.atlas_network_carrier !== 'electricity') continue;
    const fromHint = normalizeCode(edge.from_country_code || edge.fromCountryCode || edge.fromCountry || edge.country0);
    const toHint = normalizeCode(edge.to_country_code || edge.toCountryCode || edge.toCountry || edge.country1);
    const explicitCountries = Array.isArray(edge.country_codes) ? edge.country_codes.map(normalizeCode) : [];
    if ((fromHint && !selected.has(fromHint)) || (toHint && !selected.has(toHint))
      || (explicitCountries.length && explicitCountries.some(code => !selected.has(code)))) continue;
    const sourceCountry = normalizeCode(edge.sourceCountryCode);
    if (!edge.is_cross_border_bridge && sourceCountry && !selected.has(sourceCountry)) continue;
    const resolveEndpoint = (side, hint) => {
      const raw = edge[side] ?? edge[`${side}Node`] ?? edge[`${side}Bus`] ?? '';
      const key = String(raw).trim();
      if (!key) return null;
      // National PyPSA caches may reuse bus IDs across countries. Their
      // source-network tag disambiguates ordinary in-country branches; the
      // stitched border layer carries explicit endpoint country codes.
      const preferredCountry = hint || (!edge.is_cross_border_bridge ? sourceCountry : '');
      if (preferredCountry) return identitiesByCountry.get(preferredCountry)?.has(key) ? preferredCountry : null;
      const matches = identities.get(key);
      return matches?.size === 1 ? [...matches][0] : null;
    };
    const a = resolveEndpoint('from', fromHint);
    const b = resolveEndpoint('to', toHint);
    if (!a || !b) { unresolved += 1; continue; }
    if (a !== b) pairs.set([a, b].sort().join('|'), [a, b].sort());
  }
  // Use country interfaces, not raw line counts: finer caches must not gain
  // artificial influence merely because they contain more parallel branches.
  const edges = [...pairs.values()];
  let groups = codes.filter(code => !protectedSet.has(code)).map(code => [code]);
  if (automaticLimit) {
    // Deterministic weighted modularity agglomeration: merge adjacent country
    // groups only while doing so improves the topology's community score.
    // This lets the network choose both region count and largest region size.
    const eligibleEdges = edges.filter(([a, b]) => !protectedSet.has(a) && !protectedSet.has(b));
    const totalWeight = eligibleEdges.length;
    const degree = new Map(groups.map(([code]) => [code,
      eligibleEdges.filter(([a, b]) => a === code || b === code).length]));
    const degreeOf = group => group.reduce((total, code) => total + (degree.get(code) || 0), 0);
    while (groups.length > 1 && totalWeight > 0) {
      let best = null;
      for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) {
        const left = groups[i]; const right = groups[j];
        const links = eligibleEdges.filter(([a, b]) => (left.includes(a) && right.includes(b))
          || (left.includes(b) && right.includes(a))).length;
        if (!links) continue;
        const gain = (links / totalWeight)
          - ((degreeOf(left) * degreeOf(right)) / (2 * totalWeight * totalWeight));
        const key = [...left, ...right].sort().join('-');
        if (gain > 0 && (!best || gain > best.gain || (gain === best.gain && key < best.key))) {
          best = { i, j, gain, key };
        }
      }
      if (!best) break;
      groups = groups.filter((_, index) => index !== best.i && index !== best.j)
        .concat([[...groups[best.i], ...groups[best.j]].sort()]).sort((a, b) => a.join('-').localeCompare(b.join('-')));
    }
  } else {
    // Manual limit remains a hard cap. Choose the strongest available country
    // interface, breaking ties by normalized connection density and name.
    while (groups.length > 1) {
      let best = null;
      for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) {
        const left = groups[i]; const right = groups[j];
        if (left.length + right.length > maxCountries) continue;
        const links = edges.filter(([a, b]) => (left.includes(a) && right.includes(b)) || (left.includes(b) && right.includes(a))).length;
        if (!links) continue;
        const score = links / Math.sqrt(left.length * right.length);
        const key = [...left, ...right].sort().join('-');
        if (!best || score > best.score || (score === best.score && key < best.key)) best = { i, j, score, key };
      }
      if (!best) break;
      groups = groups.filter((_, index) => index !== best.i && index !== best.j)
        .concat([[...groups[best.i], ...groups[best.j]].sort()]).sort((a, b) => a.join('-').localeCompare(b.join('-')));
    }
  }
  const regions = groups.filter(group => group.length > 1).map(countryCodes => ({
    name: countryCodes.join(' + '), countryCodes,
  }));
  const membership = Object.fromEntries(groups.flatMap(group => group.map(code => [code, group.join('+')])));
  const warnings = [];
  const missingBusCountries = codes.filter(code => !loaded.has(code));
  if (missingBusCountries.length) warnings.push(`No cached electricity buses were found for ${missingBusCountries.join(', ')}; those countries were kept separate.`);
  if (unresolved) warnings.push(`${unresolved} electricity links still have endpoints that do not match a loaded bus; they were excluded rather than guessed.`);
  return { regions, groups, protectedCountries: codes.filter(code => protectedSet.has(code)), warnings,
    maxCountriesMode: automaticLimit ? 'automatic' : 'manual',
    maxCountriesLimit: automaticLimit ? null : maxCountries,
    largestRegionSize: regions.reduce((largest, region) => Math.max(largest, region.countryCodes.length), 0),
    interfacesBefore: edges.length,
    interfacesAfter: edges.filter(([a, b]) => (membership[a] || a) !== (membership[b] || b)).length };
}
