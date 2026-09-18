const countryCode = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'UK' ? 'GB' : normalized;
};

const coordinate = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const isGridBus = (facility) => (
  String(facility?.component_type || '').trim().toLowerCase() === 'bus'
  && coordinate(facility?.latitude) != null
  && coordinate(facility?.longitude) != null
);

const nearestNode = (nodes, longitude, latitude) => {
  if (!nodes?.length || longitude == null || latitude == null) return null;
  const longitudeScale = Math.max(0.2, Math.cos(latitude * Math.PI / 180));
  let selected = null;
  let selectedDistance = Infinity;
  for (const node of nodes) {
    const dx = (coordinate(node.longitude) - longitude) * longitudeScale;
    const dy = coordinate(node.latitude) - latitude;
    const distance = dx * dx + dy * dy;
    if (distance < selectedDistance) {
      selected = node;
      selectedDistance = distance;
    }
  }
  return selected;
};

const endpoint = (record, index, nodesByCountry, nearestCache) => {
  const country = countryCode(record[`country${index}`]);
  const longitude = coordinate(record[`longitude${index}`]);
  const latitude = coordinate(record[`latitude${index}`]);
  const sourceBus = String(record[`bus${index}`] || '');
  const candidates = nodesByCountry.get(country);
  if (!candidates?.length) {
    return {
      country, id: `border-${country}-${sourceBus}`, name: sourceBus,
      longitude, latitude, loaded: false,
    };
  }
  const cacheKey = `${country}::${sourceBus}`;
  if (!nearestCache.has(cacheKey)) {
    nearestCache.set(cacheKey, nearestNode(candidates, longitude, latitude));
  }
  const node = nearestCache.get(cacheKey);
  return {
    country,
    id: String(node?.id || node?.nodeId || node?.name || cacheKey),
    name: String(node?.name || node?.bus || node?.cluster_id || sourceBus),
    longitude: coordinate(node?.longitude),
    latitude: coordinate(node?.latitude),
    loaded: true,
  };
};

const addNumber = (current, value) => {
  const numeric = coordinate(value);
  return numeric == null ? current : (current || 0) + numeric;
};

/**
 * Stitch authoritative OSM/PyPSA-Eur border branches onto the active cache
 * nodes. Each endpoint is independently snapped to its country's current
 * resolution, so mixed NUTS/full/bidding-zone views retain continuity.
 */
export function stitchElectricityCrossBorderConnections(
  connections,
  facilities,
  topologyRecords,
  loadedNetworks,
) {
  const baseConnections = (connections || []).filter((connection) => (
    !connection?.is_cross_border_bridge
    && !(connection?.is_reference_topology && connection?.is_cross_border)
  ));
  const loadedCountries = new Set(
    (loadedNetworks || []).map((network) => countryCode(network?.countryCode)).filter(Boolean)
  );
  if (!loadedCountries.size) return baseConnections;

  const nodesByCountry = new Map();
  for (const facility of facilities || []) {
    if (!isGridBus(facility)) continue;
    const country = countryCode(facility.sourceCountryCode || facility.country);
    if (!loadedCountries.has(country)) continue;
    if (!nodesByCountry.has(country)) nodesByCountry.set(country, []);
    nodesByCountry.get(country).push(facility);
  }

  const nearestCache = new Map();
  const groups = new Map();
  for (const record of topologyRecords || []) {
    const country0 = countryCode(record?.country0);
    const country1 = countryCode(record?.country1);
    if (country0 === country1 || (!loadedCountries.has(country0) && !loadedCountries.has(country1))) continue;
    const from = endpoint(record, 0, nodesByCountry, nearestCache);
    const to = endpoint(record, 1, nodesByCountry, nearestCache);
    if (!from.loaded && !to.loaded) continue;
    if ([from.longitude, from.latitude, to.longitude, to.latitude].some((value) => value == null)) continue;
    if (from.id === to.id) continue;

    const orderedEndpointIds = [`${from.country}:${from.id}`, `${to.country}:${to.id}`].sort();
    const key = `${record.type || 'line'}::${orderedEndpointIds.join('::')}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        from, to, type: record.type === 'link' ? 'link' : 'line',
        sourceIds: [], sourceCount: 0, s_nom: null, p_nom: null,
        length: null, circuits: null, voltages: new Set(),
      };
      groups.set(key, group);
    }
    group.sourceIds.push(String(record.source_id || record.id || ''));
    group.sourceCount += 1;
    group.s_nom = addNumber(group.s_nom, record.s_nom);
    group.p_nom = addNumber(group.p_nom, record.p_nom);
    group.length = addNumber(group.length, record.length);
    group.circuits = addNumber(group.circuits, record.circuits);
    if (coordinate(record.voltage) != null) group.voltages.add(coordinate(record.voltage));
  }

  const bridges = [...groups.values()].map((group) => {
    const countries = [group.from.country, group.to.country];
    const nodeIds = [group.from.id, group.to.id];
    const identity = [`${countries[0]}:${nodeIds[0]}`, `${countries[1]}:${nodeIds[1]}`].sort().join('--');
    return {
      id: `cross-border-${group.type}-${identity}`,
      name: `${countries[0]} ↔ ${countries[1]}${group.sourceCount > 1 ? ` · ${group.sourceCount} branches` : ''}`,
      from: group.from.id,
      to: group.to.id,
      fromNode: group.from.name,
      toNode: group.to.name,
      from_country_code: countries[0],
      to_country_code: countries[1],
      country_codes: countries,
      type: group.type,
      collection: group.type === 'link' ? 'CrossBorderLink' : 'CrossBorderLine',
      carrier: group.type === 'link' ? 'DC' : 'AC',
      color: '#FACC15',
      weight: 2.4,
      opacity: 0.9,
      is_cross_border: true,
      is_cross_border_bridge: true,
      is_reference_topology: true,
      sourceCountryCode: [...countries].sort()[0],
      sourceNetworkFilename: 'electricity-cross-border',
      coordinates: [
        [group.from.longitude, group.from.latitude],
        [group.to.longitude, group.to.latitude],
      ],
      source_edge_count: group.sourceCount,
      source_edge_ids: group.sourceIds,
      voltage: group.voltages.size === 1 ? [...group.voltages][0] : null,
      voltages: [...group.voltages].sort((a, b) => a - b),
      circuits: group.circuits,
      length: group.length,
      s_nom: group.s_nom,
      p_nom: group.p_nom,
    };
  });
  return [...baseConnections, ...bridges];
}
