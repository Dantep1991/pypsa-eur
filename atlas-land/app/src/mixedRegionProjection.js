// A map-only projection. The source country caches remain untouched so lazy
// layers, exports and model runs never mistake a regional marker for a bus.
import { groupPypsaFacilities } from './pypsaMapBatch';
const codeOf = (record) => String(record?.sourceCountryCode || record?.country || '').toUpperCase();
const isElectricityRecord = (record) => !record?.atlas_network_carrier
  || record.atlas_network_carrier === 'electricity';
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const point = (record) => {
  const latitude = number(record?.latitude);
  const longitude = number(record?.longitude);
  return latitude == null || longitude == null ? null : { latitude, longitude };
};

export function projectMixedCountryRegions(facilities, connections, regions = [], referenceFacilities = facilities) {
  if (!regions.length) return { facilities, connections };
  const visibleBusCountries = new Set(facilities
    .filter((facility) => isElectricityRecord(facility)
      && String(facility.component_type || '').toLowerCase() === 'bus')
    .map(codeOf));
  const regionByCountry = new Map(regions.flatMap((region) => (
    region.countryCodes.map((code) => [code, region])
  )));
  const busByIdentity = new Map();
  const busesByRegion = new Map();
  for (const facility of referenceFacilities) {
    if (String(facility.component_type || '').toLowerCase() !== 'bus') continue;
    const country = codeOf(facility);
    const region = regionByCountry.get(country);
    if (region) {
      if (!busesByRegion.has(region.id)) busesByRegion.set(region.id, new Map());
      const byCountry = busesByRegion.get(region.id);
      if (!byCountry.has(country)) byCountry.set(country, []);
      byCountry.get(country).push(facility);
    }
    for (const identity of [facility.id, facility.name, facility.nodeId]) {
      if (identity != null) busByIdentity.set(String(identity), facility);
    }
  }

  const regionNodes = new Map();
  for (const region of regions) {
    const byCountry = busesByRegion.get(region.id);
    // If a carrier overlay or country filter hides one member, keep the
    // visible countries separate rather than presenting a partial region as
    // though it represented the complete named grouping.
    if (byCountry?.size !== region.countryCodes.length
        || (visibleBusCountries.size && !region.countryCodes.every((code) => visibleBusCountries.has(code)))) continue;
    // Equal country weighting prevents a highly nodal national cache from
    // pulling a multi-country marker almost entirely into that country.
    const countryCentres = [...byCountry.values()].map((buses) => {
      const points = buses.map(point).filter(Boolean);
      if (!points.length) return null;
      return {
        latitude: points.reduce((sum, item) => sum + item.latitude, 0) / points.length,
        longitude: points.reduce((sum, item) => sum + item.longitude, 0) / points.length,
      };
    }).filter(Boolean);
    if (!countryCentres.length) continue;
    const first = [...byCountry.values()][0][0];
    const id = `atlas-region:${region.id}`;
    const latitude = countryCentres.reduce((sum, item) => sum + item.latitude, 0) / countryCentres.length;
    const longitude = countryCentres.reduce((sum, item) => sum + item.longitude, 0) / countryCentres.length;
    regionNodes.set(region.id, {
      ...first, id, nodeId: id, bus: region.name, cluster_id: id, is_virtual: false, name: region.name, parentName: region.name,
      latitude, longitude, country: region.name,
      country_codes: region.countryCodes, sourceCountryCode: region.countryCodes[0],
      sourceNetworkFilename: 'atlas-visual-region',
      atlas_region_group_name: region.name, atlas_visual_aggregation_only: true,
      atlas_source_count: [...byCountry.values()].reduce((sum, buses) => sum + buses.length, 0),
      properties: [{ Property: 'Topology', Value: 'Visual aggregation only — not executable', Units: '' }],
    });
  }
  if (!regionNodes.size) return { facilities, connections };

  const groupedAssets = new Map();
  const visibleFacilities = [...regionNodes.values()].filter((node) => (
    node.country_codes.every((code) => visibleBusCountries.has(code))
  ));
  for (const facility of facilities) {
    if (!isElectricityRecord(facility)) {
      visibleFacilities.push(facility);
      continue;
    }
    const region = regionByCountry.get(codeOf(facility));
    const node = region && regionNodes.get(region.id);
    if (!node) {
      visibleFacilities.push(facility);
      continue;
    }
    if (String(facility.component_type || '').toLowerCase() === 'bus') continue;
    const carrier = String(facility.carrier_key || facility.carrier || facility.type || '');
    const key = [region.id, facility.atlas_domain, facility.component_type, carrier, facility.capacity_units].join('|');
    if (!groupedAssets.has(key)) groupedAssets.set(key, []);
    groupedAssets.get(key).push(facility);
  }
  for (const [key, members] of groupedAssets) {
    const first = members[0];
    const region = regionByCountry.get(codeOf(first));
    const node = regionNodes.get(region.id);
    const totals = {};
    for (const field of ['p_nom', 'p_nom_opt', 'e_nom', 'p_set']) {
      if (members.some((item) => number(item[field]) != null)) {
        totals[field] = members.reduce((sum, item) => sum + (number(item[field]) || 0), 0);
      }
    }
    const id = `atlas-region-asset:${key}`;
    visibleFacilities.push({
      ...first, ...totals, id, nodeId: id, name: `${region.name} ${first.carrier_nice_name || first.type || first.component_type}`,
      bus: node.id, latitude: node.latitude, longitude: node.longitude,
      country: region.name, country_codes: region.countryCodes,
      sourceCountryCode: region.countryCodes[0], sourceNetworkFilename: 'atlas-visual-region',
      atlas_region_group_name: region.name, atlas_visual_aggregation_only: true,
      atlas_source_count: members.length,
      properties: [{ Property: 'Topology', Value: 'Visual aggregation only — not executable', Units: '' },
        { Property: 'Source assets', Value: members.length, Units: '' }],
    });
  }

  const groupedConnections = new Map();
  const visibleConnections = [];
  for (const connection of connections) {
    if (!isElectricityRecord(connection)) {
      visibleConnections.push(connection);
      continue;
    }
    const fromBus = busByIdentity.get(String(connection.from || connection.fromNode || ''));
    const toBus = busByIdentity.get(String(connection.to || connection.toNode || ''));
    const fromRegion = fromBus && regionByCountry.get(codeOf(fromBus));
    const toRegion = toBus && regionByCountry.get(codeOf(toBus));
    const fromNode = fromRegion && regionNodes.get(fromRegion.id);
    const toNode = toRegion && regionNodes.get(toRegion.id);
    if (!fromNode && !toNode) {
      visibleConnections.push(connection);
      continue;
    }
    const from = fromNode?.id || String(connection.from || connection.fromNode || '');
    const to = toNode?.id || String(connection.to || connection.toNode || '');
    if (from === to) continue; // Internal branches are absorbed, not drawn as self-loops.
    const originalCoordinates = connection.coordinates || [];
    const start = fromNode ? [fromNode.longitude, fromNode.latitude]
      : (point(fromBus) ? [number(fromBus.longitude), number(fromBus.latitude)] : originalCoordinates[0]);
    const end = toNode ? [toNode.longitude, toNode.latitude]
      : (point(toBus) ? [number(toBus.longitude), number(toBus.latitude)] : originalCoordinates[originalCoordinates.length - 1]);
    if (!start || !end) continue;
    const key = [[from, to].sort().join('::'), connection.type || connection.component_type,
      connection.carrier || '',
      connection.capacity_units || ''].join('|');
    if (!groupedConnections.has(key)) groupedConnections.set(key, []);
    groupedConnections.get(key).push({ connection, from, to, start, end });
  }
  for (const [key, members] of groupedConnections) {
    const first = members[0];
    const totals = {};
    for (const field of ['s_nom', 'p_nom']) {
      if (members.some(({ connection }) => number(connection[field]) != null)) {
        totals[field] = members.reduce((sum, { connection }) => sum + (number(connection[field]) || 0), 0);
      }
    }
    visibleConnections.push({
      ...first.connection, ...totals, id: `atlas-region-link:${key}`,
      name: `${first.from} ↔ ${first.to}`,
      from: first.from, to: first.to, fromNode: first.from, toNode: first.to,
      coordinates: [first.start, first.end],
      coordinate_paths: undefined,
      atlas_visual_aggregation_only: true, source_edge_count: members.length,
      source_edge_ids: members.map(({ connection }) => connection.id).filter(Boolean),
    });
  }
  return { facilities: groupPypsaFacilities(visibleFacilities), connections: visibleConnections };
}
