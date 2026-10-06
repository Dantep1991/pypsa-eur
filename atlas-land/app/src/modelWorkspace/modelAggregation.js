// Visual projection of one immutable project version. No cache substitution,
// nearest-node assignment, disaggregation, or executable model mutation.
import { RESULT_SERIES_COLORS } from './resultColors';
const finite = value => value != null && value !== '' && Number.isFinite(Number(value));
const keyId = (kind, key) => `atlas-aggregate:${kind}:${encodeURIComponent(key)}`;
export const GEOGRAPHY_LEVELS = [
  ['full', 'Full / PyPSA'], ['nuts3', 'NUTS3'], ['nuts2', 'NUTS2'], ['nuts1', 'NUTS1'],
  ['ehighway', 'e-Highway'], ['bidding_zone', 'Bidding Zone'], ['country', 'Country'], ['regional', 'Regional'],
];

export function bindAggregationCatalog(scene, catalog) {
  if (catalog?.schema !== 'nohm.atlas.aggregation-catalog.v1'
      || catalog.project_id !== scene.meta.projectId || catalog.model_version !== scene.meta.version) {
    throw new Error('Geography crosswalk belongs to another project or version.');
  }
  const facilities = scene.facilities.map(node => {
    const row = catalog.node_mapping[node.id] || catalog.node_mapping[node.bus];
    const sourceCountry = catalog.country_aliases?.[node.country] || node.country;
    const validSourceCountry = !catalog.country_codes || catalog.country_codes.includes(sourceCountry);
    return { ...node, country: row?.country_ambiguous ? '' : row?.country || (validSourceCountry ? sourceCountry : '') || '', bidding_zone: row?.bidding_zone || '' };
  });
  return { ...scene, facilities, meta: { ...scene.meta, aggregationCatalog: catalog,
    countries: [...new Set(facilities.filter(item => item.component_type === 'Bus').map(item => item.country).filter(Boolean))].sort() } };
}

export function regionAssignment(catalog, schemeId, regionIds, countries) {
  const scheme = catalog?.regional_registry?.schemes.find(item => item.id === schemeId);
  if (!scheme) throw new Error('Choose a registered Geography region scheme.');
  const selected = new Set(regionIds), assignment = new Map();
  if (regionIds.some(id => !scheme.regions.some(item => item.id === id))) throw new Error('Unknown region in this scheme.');
  // Published planning groups are often overlapping, not a partition. Combine
  // connected selections in this visual projection only, never duplicate nodes
  // or alter the canonical Geography definitions. Stable across selection order.
  const groups = [];
  scheme.regions.filter(region => selected.has(region.id)).forEach(region => {
    const members = new Set(region.countries.filter(country => countries.includes(country)));
    if (!members.size) return;
    const overlaps = groups.filter(group => [...members].some(country => group.countries.has(country)));
    const combined = { regions: [region], countries: members };
    overlaps.forEach(group => {
      combined.regions.push(...group.regions);
      group.countries.forEach(country => combined.countries.add(country));
      groups.splice(groups.indexOf(group), 1);
    });
    groups.push(combined);
  });
  groups.forEach(group => {
    const members = group.regions.sort((a, b) => a.id.localeCompare(b.id));
    const region = members.length === 1 ? members[0] : {
      id: `combined:${JSON.stringify(members.map(item => item.id))}`,
      name: members.map(item => item.name).join(' + '),
      countries: [...group.countries].sort(), source_regions: members.map(item => item.id), visual_union: true,
    };
    group.countries.forEach(country => assignment.set(country, region));
  });
  if (!assignment.size) throw new Error('Choose a region containing countries in this model.');
  return assignment;
}

export function buildModelAggregation(scene, level, options = {}) {
  if (!scene?.meta?.projectId || !scene.meta.version || !scene.meta.aggregationCatalog) throw new Error('Load the version-bound Geography crosswalk first.');
  if (!['bidding_zone', 'country', 'regional', 'mixed'].includes(level)) throw new Error('This view cannot split the native model into a finer topology.');
  const catalog = scene.meta.aggregationCatalog;
  const nativeIndex = GEOGRAPHY_LEVELS.findIndex(([id]) => id === catalog.native_resolution);
  const requestedIndex = GEOGRAPHY_LEVELS.findIndex(([id]) => id === level);
  if (level === 'bidding_zone' && nativeIndex < 0) throw new Error('Native resolution is not declared; bidding-zone projection is unavailable.');
  if (level !== 'mixed' && nativeIndex > requestedIndex) throw new Error('This would split the native topology into a finer geography.');
  const resolutions = level === 'mixed' ? options.resolutionByCountry : null;
  if (level === 'mixed') {
    if (!resolutions || typeof resolutions !== 'object' || Array.isArray(resolutions)) throw new Error('Choose the resolution for each model country.');
    Object.values(resolutions).forEach(tier => {
      if (!['native', 'bidding_zone', 'country', 'regional'].includes(tier)) throw new Error('Choose a supported mixed-view granularity.');
      const tierIndex = GEOGRAPHY_LEVELS.findIndex(([id]) => id === tier);
      if (tier !== 'native' && (nativeIndex > tierIndex || (tier === 'bidding_zone' && nativeIndex < 0))) throw new Error('This would split the native topology into a finer geography.');
    });
  }
  const sourceNodes = scene.facilities.filter(node => node.component_type === 'Bus');
  const regionalCountries = resolutions ? scene.meta.countries.filter(country => resolutions[country] === 'regional') : scene.meta.countries;
  const regions = level === 'regional' || regionalCountries.some(country => resolutions?.[country] === 'regional')
    ? regionAssignment(catalog, options.schemeId, options.regionIds || [], regionalCountries) : new Map();
  const nodeGroups = new Map(), nodeMap = new Map(), missing = [];
  for (const node of sourceNodes) {
    const requestedTier = resolutions ? resolutions[node.country] || 'native' : level;
    const member = regions.get(node.country);
    const group = requestedTier === 'native' ? '' : requestedTier === 'bidding_zone' ? node.bidding_zone
      : member ? member.id : node.country;
    const tier = requestedTier === 'regional' && !member ? 'country' : requestedTier;
    const key = group ? `${tier}:${group}` : `native:${node.id}`;
    if (!group && requestedTier !== 'native') missing.push(node.id);
    if (!nodeGroups.has(key)) nodeGroups.set(key, { key, tier: group ? tier : 'native', label: member?.name || group || node.name, members: [] });
    nodeGroups.get(key).members.push(node);
  }
  const nodes = [...nodeGroups.values()].map(group => {
    const ids = group.members.map(node => node.id);
    const id = group.tier === 'native' ? ids[0] : keyId('node', group.key);
    const first = group.members[0];
    const node = { ...first, id, nodeId: id, name: group.label, parentName: group.label,
      latitude: group.members.reduce((sum, member) => sum + Number(member.latitude), 0) / ids.length,
      longitude: group.members.reduce((sum, member) => sum + Number(member.longitude), 0) / ids.length,
      country: group.tier === 'regional' ? '' : first.country,
      atlas_source_ids: ids, atlas_source_count: ids.length, atlas_resolution_tier: group.tier,
      atlas_aggregation_countries: [...new Set(group.members.map(member => member.country).filter(Boolean))],
      properties: [{ Property: 'Geography', Value: group.label },
        { Property: 'Source nodes', Value: ids.join(', ') },
        { Property: 'Countries', Value: [...new Set(group.members.map(member => member.country).filter(Boolean))].join(', ') },
        { Property: 'Projection', Value: 'Visual only; source model unchanged' }] };
    ids.forEach(sourceId => nodeMap.set(sourceId, node));
    return node;
  });
  // Keep every asset identity and its input/output records. Only its mapped bus
  // position changes; intensities, prices and unknown capacities are not summed.
  const assets = scene.facilities.filter(item => item.component_type !== 'Bus').map(asset => {
    const bus = nodeMap.get(asset.bus);
    return bus ? { ...asset, source_bus: asset.bus, bus: bus.id, bus_label: bus.name,
      locationKey: bus.id, latitude: bus.latitude, longitude: bus.longitude,
      atlas_source_ids: [asset.id], atlas_resolution_tier: bus.atlas_resolution_tier } : asset;
  });
  const groups = new Map(), internalized = [], unmapped = [];
  for (const line of scene.connections) {
    const from = nodeMap.get(line.fromNode || line.from), to = nodeMap.get(line.toNode || line.to);
    if (!from || !to) { unmapped.push(line.id); continue; }
    if (from.id === to.id) { internalized.push(line); continue; }
    const [a, b] = [from.id, to.id].sort();
    const key = JSON.stringify([a, b, line.component_type, line.carrier, line.category, line.capacity_units]);
    if (!groups.has(key)) groups.set(key, { from: a, to: b, members: [] });
    groups.get(key).members.push({ line, sign: from.id === a ? 1 : -1 });
  }
  const connections = [...groups.entries()].map(([key, group]) => {
    const ids = group.members.map(item => item.line.id);
    const allCapacity = group.members.every(item => finite(item.line.p_nom));
    return { ...group.members[0].line, id: keyId('link', key),
      name: `${nodes.find(node => node.id === group.from).name} ⇄ ${nodes.find(node => node.id === group.to).name}`,
      from: group.from, fromNode: group.from, to: group.to, toNode: group.to,
      from_label: nodes.find(node => node.id === group.from).name,
      to_label: nodes.find(node => node.id === group.to).name,
      p_nom: allCapacity ? group.members.reduce((sum, item) => sum + Number(item.line.p_nom), 0) : null,
      atlas_source_ids: ids, atlas_source_count: ids.length,
      atlas_source_directions: Object.fromEntries(group.members.map(item => [item.line.id, item.sign])),
      properties: [{ Property: 'Member connections', Value: ids.join(', ') },
        { Property: 'Capacity', Value: 'Sum of reported member capacities; not an interface transfer limit' }] };
  });
  return { ...scene, facilities: [...nodes, ...assets], connections,
    aggregation: { level, nodeMap, sourceNodes, regions, catalog, options: { ...options } },
    meta: { ...scene.meta, preview: { counts: { sourceNodes: sourceNodes.length, projectedNodes: nodes.length,
      sourceLinks: scene.connections.length, projectedLinks: connections.length, internalizedLinks: internalized.length },
      internalized, unmapped, missingMappings: missing,
      ...(options.profile ? { profile: options.profile } : {}),
      label: `${GEOGRAPHY_LEVELS.find(item => item[0] === level)?.[1] || 'Mixed resolution'} · visual aggregation`,
      capabilities: { mutatesSource: false, executable: false, canDisaggregate: false } } } };
}

export function reapplyModelAggregation(scene, previous) {
  const aggregation = previous?.aggregation;
  if (!aggregation || aggregation.catalog.project_id !== scene.meta.projectId
      || aggregation.catalog.model_version !== scene.meta.version || !scene.meta.aggregationCatalog) return null;
  return buildModelAggregation(scene, aggregation.level, aggregation.options);
}

// Show the countries actually grouped in this view, not every member of the
// published region (some may be absent or use a finer mixed-resolution tier).
export function modelAggregationRegions(preview) {
  const assignments = preview?.aggregation?.regions;
  if (!(assignments instanceof Map)) return [];
  const groups = new Map();
  assignments.forEach((region, country) => {
    if (!groups.has(region.id)) groups.set(region.id, { id: region.id, name: region.name, countryCodes: [] });
    groups.get(region.id).countryCodes.push(country);
  });
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id))
    .map(group => ({ ...group, countryCodes: group.countryCodes.sort() }));
}

export function projectAggregatedFlowFrame(frame, preview) {
  if (!frame || !preview?.aggregation) return frame;
  const nodes = preview.aggregation.nodeMap, groups = new Map(), internal = [];
  const node = name => nodes.get(`Node:${name}`) || nodes.get(name);
  for (const line of frame.lines) {
    // GasNode geography is a different typed topology, even when a node name
    // happens to equal an electricity Node name. Never reuse a power crosswalk.
    if (line.class_name !== 'Line') {
      groups.set(`native:${line.id}`, { native: line }); continue;
    }
    // Actual endpoints already reflect the reported sign/direction contract.
    const from = node(line.actualFrom), to = node(line.actualTo);
    if (!from || !to) {
      // A result endpoint absent from the loaded grid remains explicitly native.
      groups.set(`native:${line.id}`, { native: line }); continue;
    }
    if (from.id === to.id) { internal.push(line.id); continue; }
    const [a, b] = [from.id, to.id].sort();
    const key = JSON.stringify([a, b, line.class_name, line.category, line.unit]);
    if (!groups.has(key)) groups.set(key, { from: from.id === a ? from : to, to: from.id === a ? to : from, members: [], signed: 0 });
    const group = groups.get(key);
    group.members.push(line); group.signed += Math.abs(line.value) * (from.id === a ? 1 : -1);
  }
  let selectedId = '';
  const lines = [...groups.entries()].map(([key, group]) => {
    if (group.native) return group.native;
    const members = group.members, first = members[0], reverse = group.signed < 0;
    const from = reverse ? group.to : group.from, to = reverse ? group.from : group.to;
    const id = keyId('flow', key);
    const highlighted = members.filter(member => member.color === RESULT_SERIES_COLORS[2]).length;
    if (members.some(member => member.id === frame.selectedId)) selectedId = id;
    return { ...first, id, name: `${group.from.name} ⇄ ${group.to.name}`, value: Math.abs(group.signed),
      magnitude: Math.abs(group.signed), signedValue: group.signed, net: true,
      coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]], actualFrom: from.name, actualTo: to.name,
      sourceIds: members.map(member => member.id), sourceNames: members.map(member => member.name),
      metrics: null, utilisation: null, capacityEvidence: null, aggregated: true,
      color: highlighted ? RESULT_SERIES_COLORS[2] : RESULT_SERIES_COLORS[0],
      capacityNote: highlighted ? `${highlighted} member connections highlighted; limits apply to members, not this aggregate interface.`
        : 'Capacity evidence remains on individual member connections.' };
  });
  return { ...frame, lines, selectedId: selectedId || frame.selectedId,
    maximum: Math.max(0, ...lines.map(line => Math.abs(line.value))), internalized: internal };
}

export function projectAggregatedAssetFrame(frame, preview) {
  if (!frame || !preview?.aggregation) return frame;
  const groups = new Map();
  for (const marker of frame.markers) {
    // Asset API IDs encode class/category/name. Resolve their explicit Node
    // memberships and registered display anchors, not a plant-name prefix.
    const projected = (marker.nodes || []).map(node => preview.aggregation.nodeMap.get(node.position?.canonical_reference || node.id)
      || (node.class_name === 'Node' ? preview.aggregation.nodeMap.get(`Node:${node.name}`) : null) || node)
      .filter((node, index, all) => all.findIndex(other => other.id === node.id) === index);
    const node = projected.find(node => finite(node.latitude) && finite(node.longitude));
    const position = node ? [node.latitude, node.longitude] : marker.position;
    const key = JSON.stringify(position);
    const previous = groups.get(key);
    if (!previous) groups.set(key, { ...marker, position, nodes: projected,
      objects: [...(marker.objects || [])] });
    else {
      projected.forEach(item => { if (!previous.nodes.some(other => other.id === item.id)) previous.nodes.push(item); });
      (marker.objects || []).forEach(item => { if (!previous.objects.some(other => other.id === item.id)) previous.objects.push(item); });
      previous.maximum = Math.max(previous.maximum || 0, marker.maximum || 0);
      previous.measured = previous.objects.filter(item => Number.isFinite(item.measurement?.value)).length;
    }
  }
  // Keep asset measurements distinct: a geography change is not permission to
  // sum prices, intensities or incompatible units. One inspectable marker/site.
  return { ...frame, markers: [...groups.values()] };
}
