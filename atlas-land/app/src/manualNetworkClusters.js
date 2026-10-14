// Reversible display projection. Source records are never distributed or edited.
import { groupPypsaFacilities } from './pypsaMapBatch';

export const CLUSTER_SCHEMA = 'nohm.atlas.manual-clusters.v1';
export const countryOf = record => String(record.sourceCountryCode || record.country || '').toUpperCase();
export const sourceOf = record => String(record.sourceNetworkFilename || '');
export const busKey = (record, id = record.id ?? record.name ?? record.nodeId) =>
  JSON.stringify([countryOf(record), sourceOf(record), String(id ?? '')]);
export const numeric = value => ['number','string'].includes(typeof value) && value !== ''
  && Number.isFinite(Number(value)) ? Number(value) : null;
export function ungroupFacilities(records = []) {
  return [...new Map(records.flatMap(r => [r, ...(r.sameLocationFacilities || [])])
    .map(r => [busKey(r), r])).values()];
}
export function nativeClusterNodes(facilities) {
  return ungroupFacilities(facilities).filter(r => !r.is_virtual
    && String(r.component_type || r.type).toLowerCase() === 'bus'
    && (!r.atlas_network_carrier || r.atlas_network_carrier === 'electricity')
    && numeric(r.latitude) !== null && numeric(r.longitude) !== null)
    .map(r => ({ key: busKey(r), country: countryOf(r), latitude: Number(r.latitude), longitude: Number(r.longitude) }));
}
export function validateClusterScheme(scheme) {
  if (scheme?.schema !== CLUSTER_SCHEMA || !Array.isArray(scheme.groups) || !scheme.groups.length) {
    throw new Error('No usable network groups were found.');
  }
  const members = new Set(); const ids = new Set();
  for (const group of scheme.groups) {
    const polygonOnly=['Polygon','MultiPolygon'].includes(group.geometry?.type)||(group.geometry?.type==='GeometryCollection'&&group.geometry.geometries?.length
      &&group.geometry.geometries.every(g=>['Polygon','MultiPolygon'].includes(g.type)));
    const territoryOnly=group.territoryOnly===true&&group.regionIds?.length&&polygonOnly;
    if (!group.id || ids.has(group.id) || !String(group.name || '').trim() || !Array.isArray(group.members) || (!group.members.length&&!territoryOnly)) {
      throw new Error('Every group needs a unique identity, name and source members.');
    }
    ids.add(group.id);
    if(group.geographyOnly===true&&group.members.length)throw new Error('Geography-only regions cannot hide source grid buses.');
    if (numeric(group.latitude) === null || numeric(group.longitude) === null) throw new Error('Every group needs a valid centre.');
    for (const member of group.members) {
      if (members.has(member)) throw new Error('A source bus belongs to more than one group.');
      const identity = JSON.parse(member);
      if (!Array.isArray(identity) || identity.length !== 3) throw new Error('Invalid source bus identity.');
      members.add(member);
    }
  }
  return scheme;
}
export const DEFAULT_CLUSTER_POLICIES = {
  p_nom: 'sum', p_nom_opt: 'sum', e_nom: 'sum', e_nom_opt: 'sum', p_set: 'sum',
  s_nom: 'sum', s_nom_opt: 'sum', capacity: 'sum', dispatch: 'sum', load: 'sum',
  capital_cost: 'capacity_weighted', marginal_cost: 'capacity_weighted', price: 'mean', efficiency: 'capacity_weighted',
};
export function aggregateClusterRecords(records, policies = DEFAULT_CLUSTER_POLICIES) {
  const result = {};
  const fields = new Set(records.flatMap(r => Object.keys(r).filter(k => numeric(r[k]) !== null
    || (Array.isArray(r[k]) && r[k].every(v => numeric(v) !== null)))));
  for (const field of fields) {
    if (['latitude', 'longitude', 'id', 'nodeId', 'bus', 'bus0', 'bus1'].includes(field)) continue;
    const values = records.map(r => numeric(r[field]));
    const mode = policies[field];
    if (records.some(r => Array.isArray(r[field]))) {
      const length = records[0][field]?.length;
      const compatible = records.every(r => Array.isArray(r[field]) && r[field].length === length);
      result[field] = compatible && mode ? Array.from({length}, (_,i) =>
        aggregateClusterRecords(records.map(r => ({...(field !== 'p_nom' ? {p_nom:r.p_nom} : {}),[field]:r[field][i]})),policies)[field]) : null;
      continue;
    }
    // Missing observations never become zero, including incomplete capacities.
    if (values.some(v => v === null)) { result[field] = null; continue; }
    if (mode === 'sum') result[field] = values.reduce((a, b) => a + b, 0);
    else if (mode === 'mean') result[field] = values.reduce((a, b) => a + b, 0) / values.length;
    else if (mode === 'capacity_weighted') {
      const weights = records.map(r => numeric(r.p_nom));
      const complete = weights.every(v => v !== null && v >= 0);
      const total = complete ? weights.reduce((a,b) => a + b, 0) : 0;
      result[field] = total > 0 ? values.reduce((sum,v,i) => sum + v * weights[i],0) / total : null;
    }
    else result[field] = values.every(v => v === values[0]) ? values[0] : null;
  }
  return result;
}
export function projectManualNetworkClusters(facilities, connections, scheme, reference = facilities) {
  if (!scheme) return { facilities, connections, warnings: [] };
  validateClusterScheme(scheme);
  const sources = ungroupFacilities(reference);
  const visible = ungroupFacilities(facilities);
  const visibleCountries = new Set(visible.map(countryOf));
  const buses = sources.filter(r => !r.is_virtual && String(r.component_type || r.type).toLowerCase() === 'bus');
  const busByKey = new Map(buses.map(r => [busKey(r), r]));
  const available = new Set(busByKey.keys());
  const requestedGroups = scheme.groups.filter(g => !(scheme.expandedGroupIds || []).includes(g.id));
  if (!requestedGroups.length) return { facilities, connections, warnings: [] };
  const groups = requestedGroups.filter(g => g.members.every(m => available.has(m))
    && g.countryCodes.every(country => visibleCountries.has(country)));
  if (!groups.length) return { facilities, connections,
    warnings: ['Saved grouping does not match the loaded source network. Load native detail before applying it.'] };
  const byMember = new Map(groups.flatMap(g => g.members.map(m => [m, g])));
  const byIdentity = new Map();
  const byRawIdentity = new Map();
  for (const bus of buses) for (const id of [bus.id, bus.name, bus.nodeId, bus.bus].filter(v => v != null)) {
    byIdentity.set(busKey(bus, id), bus);
    const raw = String(id);
    if (!byRawIdentity.has(raw)) byRawIdentity.set(raw, []);
    byRawIdentity.get(raw).push(bus);
  }
  const resolve = (record, id, countryHint) => {
    const exact = byIdentity.get(busKey(record, id));
    if (exact && (!record.is_cross_border_bridge || countryHint)
        && (!countryHint || countryOf(exact) === countryHint)) return exact;
    const matches = [...new Map((byRawIdentity.get(String(id)) || [])
      .filter(b => !countryHint || countryOf(b) === countryHint).map(b => [busKey(b), b])).values()];
    return matches.length === 1 ? matches[0] : null;
  };
  const nodeFor = g => `atlas-cluster:${scheme.id || 'preview'}:${g.id}`;
  const visibleKeys = new Set(visible.map(r => busKey(r)));
  const output = [];
  for (const group of groups) {
    if(group.geographyOnly===true)continue;
    if (group.members.length&&!group.members.some(m => visibleKeys.has(m))) continue;
    const members = group.members.map(member => busByKey.get(member));
    const first = members[0] || {component_type:'bus',type:'bus',atlas_network_carrier:'electricity',
      sourceCountryCode:group.countryCodes[0],country:group.countryCodes[0],atlas_territory_only:true};
    const totals = aggregateClusterRecords(members, { ...DEFAULT_CLUSTER_POLICIES, ...scheme.policies });
    output.push({ ...first, ...totals, id: nodeFor(group), nodeId: nodeFor(group), name: group.name, bus: nodeFor(group),
      latitude: group.latitude, longitude: group.longitude, is_virtual: false,
      sourceNetworkFilename: 'atlas-manual-cluster', country_codes: group.countryCodes,
      is_region_aggregate: true, region_code: group.id,
      atlas_visual_aggregation_only: true, atlas_cluster_name: group.name, atlas_source_count: members.length,
      atlas_source_ids: group.members, properties: [{ Property: 'Source buses', Value: members.length, Units: '' }] });
  }
  const assets = new Map();
  for (const record of visible) {
    const isBus = String(record.component_type || record.type).toLowerCase() === 'bus';
    const bus = isBus ? record : resolve(record, record.bus, countryOf(record));
    const group = bus && byMember.get(busKey(bus));
    if (!group || (record.atlas_network_carrier && record.atlas_network_carrier !== 'electricity')) { output.push(record); continue; }
    if (isBus) continue;
    const key = JSON.stringify([group.id, record.component_type, record.carrier, record.atlas_domain, record.capacity_units]);
    if (!assets.has(key)) assets.set(key, { group, records: [] });
    assets.get(key).records.push(record);
  }
  for (const [key, { group, records }] of assets) {
    const totals = aggregateClusterRecords(records, { ...DEFAULT_CLUSTER_POLICIES, ...scheme.policies });
    output.push({ ...records[0], ...totals, id: `atlas-cluster-asset:${key}`, nodeId: `atlas-cluster-asset:${key}`,
      name: `${group.name} ${records[0].carrier_nice_name || records[0].component_type}`, bus: nodeFor(group),
      latitude: group.latitude, longitude: group.longitude, sourceNetworkFilename: 'atlas-manual-cluster',
      atlas_visual_aggregation_only: true, atlas_cluster_name: group.name, atlas_source_count: records.length,
      atlas_source_ids: records.map(r => busKey(r)),
      properties: [{ Property: 'Source assets', Value: records.length, Units: '' },
        ...Object.entries(totals).filter(([,v]) => v != null).map(([field, value]) => ({ Property: field, Value: value,
          Units: field.startsWith('e_nom') ? 'MWh' : ['p_nom','p_nom_opt','p_set'].includes(field) ? 'MW' : '' }))] });
  }
  const edges = new Map(); const unchanged = []; const internal = []; let unresolved = 0;
  for (const edge of connections) {
    if (edge.atlas_network_carrier && edge.atlas_network_carrier !== 'electricity') { unchanged.push(edge); continue; }
    const fromId = edge.from ?? edge.fromNode ?? edge.bus0;
    const toId = edge.to ?? edge.toNode ?? edge.bus1;
    const fromCountry = edge.from_country_code || edge.fromCountryCode || edge.fromCountry || edge.country0;
    const toCountry = edge.to_country_code || edge.toCountryCode || edge.toCountry || edge.country1;
    const fromBus = resolve(edge, fromId, fromCountry);
    const toBus = resolve(edge, toId, toCountry);
    // An explicitly marked reference-border endpoint is a coordinate, not a
    // source bus. Retain it exactly while grouping the known domestic endpoint.
    const external = (id, country, coordinate) => edge.is_cross_border_bridge && edge.is_reference_topology
      && country && !visibleCountries.has(country) && String(id).startsWith(`border-${country}-`)
      && Array.isArray(coordinate) && coordinate.length >= 2
      && numeric(coordinate[0]) !== null && numeric(coordinate[1]) !== null;
    const path = edge.coordinates || [];
    if ((!fromBus && !external(fromId, fromCountry, path[0]))
        || (!toBus && !external(toId, toCountry, path[path.length - 1]))) {
      unchanged.push(edge); unresolved += 1; continue;
    }
    const a = fromBus && byMember.get(busKey(fromBus)); const b = toBus && byMember.get(busKey(toBus));
    if (!a && !b) { unchanged.push(edge); continue; }
    const from = a ? nodeFor(a) : fromId;
    const to = b ? nodeFor(b) : toId;
    if (from === to) { internal.push(edge); continue; }
    const key = JSON.stringify([[from, to].sort(), edge.component_type || edge.type, edge.carrier, edge.capacity_units]);
    if (!edges.has(key)) edges.set(key, { from, to, a, b, fromBus, toBus, records: [], orientations: [] });
    edges.get(key).orientations.push(from === edges.get(key).from ? 1 : -1);
    edges.get(key).records.push(edge);
  }
  for (const [key, item] of edges) {
    const { from, to, a, b, fromBus, toBus, records, orientations } = item;
    const aligned = records.map((r,i) => ({ ...r,
      ...(r.p_set !== undefined ? { p_set: Array.isArray(r.p_set)
        ? r.p_set.map(v => numeric(v) === null ? null : Number(v) * orientations[i])
        : numeric(r.p_set) === null ? null : Number(r.p_set) * orientations[i] } : {}) }));
    const original = records[0].coordinates || [];
    const start = a || fromBus; const end = b || toBus;
    unchanged.push({ ...records[0], ...aggregateClusterRecords(aligned, { ...DEFAULT_CLUSTER_POLICIES, ...scheme.policies }),
      id: `atlas-cluster-link:${key}`, name: `${a?.name || from} ↔ ${b?.name || to}`, from, to, fromNode: from, toNode: to,
      coordinates: [start ? [start.longitude, start.latitude] : original[0],
        end ? [end.longitude, end.latitude] : original[original.length - 1]], coordinate_paths: undefined,
      atlas_visual_aggregation_only: true,
      source_edge_count: records.reduce((total,r)=>total + (numeric(r.source_edge_count) ?? r.source_edge_ids?.length ?? 1),0),
      sourceNetworkFilename: 'atlas-manual-cluster',
      source_edge_ids: records.flatMap(r => r.source_edge_ids?.length ? r.source_edge_ids : [r.id]),
      atlas_source_ids: records.map(r => busKey(r)) });
  }
  return { facilities: groupPypsaFacilities(output), connections: unchanged, internalConnections: internal,
    warnings: [...(groups.length < requestedGroups.length ? ['Some groups do not match this source network and remain unaggregated.'] : []),
      ...(groups.some(g=>!g.members.length&&!g.geographyOnly)?['This historical geographic grouping contains empty electrical nodes. Rebuild with network-backed Eurostat growth.']:[]),
      ...(unresolved ? [`${unresolved} links have unresolved source endpoints and remain unaggregated.`] : [])] };
}
export function clusterStorageKey(context) {
  return `atlas-manual-network-clusters:v1:${context?.project || context?.projectId || 'reference'}`;
}
export function readClusterSchemes(storage, context) {
  try { return JSON.parse(storage.getItem(clusterStorageKey(context)) || '[]').filter(s => { validateClusterScheme(s); return true; }); }
  catch (_) { return []; }
}
export function saveClusterScheme(storage, context, scheme) {
  validateClusterScheme(scheme);
  const saved = readClusterSchemes(storage, context).filter(s => s.id !== scheme.id).concat(scheme);
  storage.setItem(clusterStorageKey(context), JSON.stringify(saved));
  return saved;
}
