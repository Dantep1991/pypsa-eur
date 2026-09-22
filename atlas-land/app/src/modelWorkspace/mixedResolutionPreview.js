const text = value => String(value ?? '').trim();
const countryCode = value => text(value).toUpperCase();
const finite = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const MODEL_MIXED_RESOLUTION_PREVIEW_SCHEMA = 'nohm.atlas.model-mixed-resolution-preview.v1';
export const MODEL_MIXED_RESOLUTION_TIERS = Object.freeze(['native', 'country']);

function sourceNodes(scene) {
  return (scene?.facilities || []).filter(facility => facility?.component_type === 'Bus');
}

function nodeCountryIndex(scene) {
  return new Map(sourceNodes(scene).map(node => [text(node.id), countryCode(node.country)]));
}

export function deriveModelCountryAdjacency(scene) {
  const countries = [...new Set(sourceNodes(scene).map(node => countryCode(node.country)).filter(Boolean))].sort();
  const adjacency = new Map(countries.map(country => [country, new Set()]));
  const countryByNode = nodeCountryIndex(scene);
  (scene?.connections || []).forEach((connection) => {
    const fromCountry = countryByNode.get(text(connection?.fromNode || connection?.from));
    const toCountry = countryByNode.get(text(connection?.toNode || connection?.to));
    if (!fromCountry || !toCountry || fromCountry === toCountry) return;
    if (!adjacency.has(fromCountry)) adjacency.set(fromCountry, new Set());
    if (!adjacency.has(toCountry)) adjacency.set(toCountry, new Set());
    adjacency.get(fromCountry).add(toCountry);
    adjacency.get(toCountry).add(fromCountry);
  });
  return new Map([...adjacency.entries()].map(([country, neighbours]) => [country, [...neighbours].sort()]));
}

export function buildModelResolutionProfile(scene, options = {}) {
  const adjacency = deriveModelCountryAdjacency(scene);
  const countries = [...adjacency.keys()].sort();
  const focusCountry = countryCode(options.focusCountry);
  if (!focusCountry || !adjacency.has(focusCountry)) {
    throw new Error('Choose a country that exists in the loaded model.');
  }
  const adjacentTier = text(options.adjacentTier || 'native').toLowerCase();
  const outerTier = text(options.outerTier || 'country').toLowerCase();
  if (!MODEL_MIXED_RESOLUTION_TIERS.includes(adjacentTier)
      || !MODEL_MIXED_RESOLUTION_TIERS.includes(outerTier)) {
    throw new Error('This model only supports its native topology and a country-level visual aggregation.');
  }
  const adjacent = new Set(adjacency.get(focusCountry) || []);
  const outer = new Set();
  adjacent.forEach(country => {
    (adjacency.get(country) || []).forEach(candidate => {
      if (candidate !== focusCountry && !adjacent.has(candidate)) outer.add(candidate);
    });
  });
  const other = countries.filter(country => (
    country !== focusCountry && !adjacent.has(country) && !outer.has(country)
  ));
  const tierByCountry = Object.fromEntries(countries.map(country => [
    country,
    country === focusCountry ? 'native' : adjacent.has(country) ? adjacentTier : outerTier,
  ]));
  return {
    focusCountry,
    rings: {
      focus: [focusCountry],
      adjacent: [...adjacent].sort(),
      outer: [...outer].sort(),
      other,
    },
    tierByCountry,
    adjacency: Object.fromEntries([...adjacency.entries()]),
    capabilities: {
      supportedTiers: [...MODEL_MIXED_RESOLUTION_TIERS],
      canAggregate: true,
      canDisaggregate: false,
    },
  };
}

export function buildModelUniformResolutionProfile(scene, tier = 'country') {
  const normalizedTier = text(tier).toLowerCase();
  if (!MODEL_MIXED_RESOLUTION_TIERS.includes(normalizedTier)) {
    throw new Error('This model only supports its native topology and a country-level visual aggregation.');
  }
  const adjacency = deriveModelCountryAdjacency(scene);
  const countries = [...adjacency.keys()].sort();
  return {
    focusCountry: '',
    rings: { focus: [], adjacent: [], outer: [], other: countries },
    tierByCountry: Object.fromEntries(countries.map(country => [country, normalizedTier])),
    adjacency: Object.fromEntries([...adjacency.entries()]),
    capabilities: {
      supportedTiers: [...MODEL_MIXED_RESOLUTION_TIERS],
      canAggregate: true,
      canDisaggregate: false,
    },
  };
}

function slug(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'unknown';
}

function aggregatePosition(records) {
  const points = records
    .map(record => ({ latitude: finite(record.latitude), longitude: finite(record.longitude) }))
    .filter(point => point.latitude != null && point.longitude != null);
  if (!points.length) return { latitude: null, longitude: null };
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}

function previewProperties(record, sourceIds, label) {
  return [
    ...(Array.isArray(record?.properties) ? record.properties.filter(property => property?.atlas_mixed_resolution !== true) : []),
    { Property: 'Resolution profile', Value: label, Units: '', atlas_mixed_resolution: true },
    { Property: 'Source identities', Value: sourceIds.length, Units: '', atlas_mixed_resolution: true },
    { Property: 'Executable', Value: 'No — visual aggregation only', Units: '', atlas_mixed_resolution: true },
  ];
}

function capacityDescriptor(record) {
  if (finite(record?.p_nom) != null) return { field: 'p_nom', value: finite(record.p_nom), unit: text(record.capacity_units) || 'MW' };
  if (finite(record?.e_nom) != null) return { field: 'e_nom', value: finite(record.e_nom), unit: text(record.capacity_units) || 'MWh' };
  if (finite(record?.p_nom_opt) != null) return { field: 'p_nom_opt', value: finite(record.p_nom_opt), unit: text(record.capacity_units) || 'MW' };
  return { field: '', value: null, unit: text(record?.capacity_units) };
}

function aggregateCountryNodes(nodes, country, sourceMeta) {
  const position = aggregatePosition(nodes);
  const sourceIds = nodes.map(node => text(node.id)).filter(Boolean).sort();
  const id = `atlas-preview:country:${country}`;
  const first = nodes[0] || {};
  return {
    ...first,
    id,
    name: `${country} aggregated model node`,
    nodeId: id,
    parentName: `${country} aggregated model node`,
    latitude: position.latitude,
    longitude: position.longitude,
    country,
    region: country,
    carrier_key: 'bus',
    carrier_nice_name: 'Aggregated model node',
    is_virtual: false,
    atlas_mixed_resolution: true,
    atlas_resolution_tier: 'country',
    atlas_source_ids: sourceIds,
    atlas_source_count: sourceIds.length,
    source_model_project: sourceMeta?.projectId || first.source_model_project,
    source_model_version: sourceMeta?.version || first.source_model_version,
    properties: previewProperties(first, sourceIds, 'Country aggregation'),
  };
}

function projectNodes(scene, profile) {
  const nodes = sourceNodes(scene);
  const grouped = new Map();
  nodes.forEach(node => {
    const country = countryCode(node.country);
    if (!country) return;
    const tier = profile.tierByCountry[country] || 'country';
    const key = tier === 'native' ? `native:${text(node.id)}` : `country:${country}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(node);
  });
  const nodeMap = new Map();
  const projectedNodes = [];
  [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([key, members]) => {
    const country = countryCode(members[0]?.country);
    const tier = profile.tierByCountry[country] || 'country';
    const projected = tier === 'native'
      ? {
          ...members[0],
          atlas_mixed_resolution: true,
          atlas_resolution_tier: 'native',
          atlas_source_ids: [text(members[0].id)],
          atlas_source_count: 1,
          properties: previewProperties(members[0], [text(members[0].id)], 'Native model topology'),
        }
      : aggregateCountryNodes(members, country, scene.meta);
    projectedNodes.push(projected);
    members.forEach(member => nodeMap.set(text(member.id), projected.id));
  });
  return { projectedNodes, nodeMap };
}

function projectAssets(scene, profile, nodeMap, projectedNodes) {
  const nodeById = new Map(projectedNodes.map(node => [text(node.id), node]));
  const nativeAssets = [];
  const grouped = new Map();
  (scene?.facilities || []).filter(facility => facility?.component_type !== 'Bus').forEach(asset => {
    const country = countryCode(asset.country);
    const tier = profile.tierByCountry[country] || 'country';
    const projectedBus = nodeMap.get(text(asset.bus));
    if (!projectedBus) return;
    if (tier === 'native') {
      nativeAssets.push({
        ...asset,
        bus: projectedBus,
        atlas_mixed_resolution: true,
        atlas_resolution_tier: 'native',
        atlas_source_ids: [text(asset.id)],
        atlas_source_count: 1,
        properties: previewProperties(asset, [text(asset.id)], 'Native model topology'),
      });
      return;
    }
    const capacity = capacityDescriptor(asset);
    const key = [
      country,
      text(asset.atlas_domain),
      text(asset.component_type),
      text(asset.carrier_key || asset.carrier || asset.type),
      capacity.field,
      capacity.unit,
    ].join('|');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ asset, capacity, projectedBus });
  });
  const aggregatedAssets = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, members]) => {
    const first = members[0].asset;
    const capacity = members[0].capacity;
    const sourceIds = members.map(member => text(member.asset.id)).filter(Boolean).sort();
    const node = nodeById.get(members[0].projectedBus);
    const total = members.reduce((sum, member) => sum + (member.capacity.value ?? 0), 0);
    const id = `atlas-preview:asset:${slug(key)}`;
    return {
      ...first,
      id,
      name: `${countryCode(first.country)} ${first.carrier_nice_name || first.type || first.component_type}`,
      nodeId: id,
      parentName: `${countryCode(first.country)} ${first.carrier_nice_name || first.type || first.component_type}`,
      bus: members[0].projectedBus,
      latitude: node?.latitude ?? first.latitude,
      longitude: node?.longitude ?? first.longitude,
      ...(capacity.field ? { [capacity.field]: total, capacity_units: capacity.unit || null } : {}),
      atlas_mixed_resolution: true,
      atlas_resolution_tier: 'country',
      atlas_source_ids: sourceIds,
      atlas_source_count: sourceIds.length,
      properties: previewProperties(first, sourceIds, 'Country aggregation'),
    };
  });
  return [...nativeAssets, ...aggregatedAssets];
}

function projectConnections(scene, nodeMap) {
  const grouped = new Map();
  const internalized = [];
  (scene?.connections || []).forEach(connection => {
    const sourceFrom = text(connection?.fromNode || connection?.from);
    const sourceTo = text(connection?.toNode || connection?.to);
    const from = nodeMap.get(sourceFrom);
    const to = nodeMap.get(sourceTo);
    if (!from || !to) return;
    const capacity = capacityDescriptor(connection);
    if (from === to) {
      internalized.push({
        sourceId: text(connection.id),
        nodeId: from,
        capacity: capacity.value,
        unit: capacity.unit,
      });
      return;
    }
    const endpoints = [from, to].sort();
    const key = [
      ...endpoints,
      text(connection.component_type || connection.type),
      capacity.field,
      capacity.unit,
    ].join('|');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ connection, capacity, endpoints });
  });
  const projected = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, members]) => {
    const first = members[0].connection;
    const capacity = members[0].capacity;
    const [from, to] = members[0].endpoints;
    const sourceIds = members.map(member => text(member.connection.id)).filter(Boolean).sort();
    const total = members.reduce((sum, member) => sum + (member.capacity.value ?? 0), 0);
    const id = `atlas-preview:link:${slug(key)}`;
    return {
      ...first,
      id,
      name: `${from} ⇄ ${to}`,
      from,
      to,
      fromNode: from,
      toNode: to,
      ...(capacity.field ? { [capacity.field]: total, capacity_units: capacity.unit || null } : {}),
      atlas_mixed_resolution: true,
      atlas_resolution_tier: 'interface',
      atlas_source_ids: sourceIds,
      atlas_source_count: sourceIds.length,
      properties: previewProperties(first, sourceIds, 'Mixed-resolution interface'),
    };
  });
  return { projected, internalized };
}

function capacityTotal(records, field) {
  return (records || []).reduce((sum, record) => sum + (finite(record?.[field]) ?? 0), 0);
}

function buildModelResolutionPreview(scene, profile) {
  if (!scene?.meta?.projectId || !scene?.meta?.version) {
    throw new Error('A loaded, version-bound model scene is required.');
  }
  const { projectedNodes, nodeMap } = projectNodes(scene, profile);
  const projectedAssets = projectAssets(scene, profile, nodeMap, projectedNodes);
  const { projected: projectedConnections, internalized } = projectConnections(scene, nodeMap);
  const sourceAssets = (scene.facilities || []).filter(facility => facility?.component_type !== 'Bus');
  const internalizedMW = internalized.filter(item => item.unit === 'MW').reduce((sum, item) => sum + (item.capacity ?? 0), 0);
  const sourceLinkMW = (scene.connections || []).filter(item => text(item.capacity_units) === 'MW').reduce((sum, item) => sum + (finite(item.p_nom) ?? 0), 0);
  const projectedLinkMW = projectedConnections.filter(item => text(item.capacity_units) === 'MW').reduce((sum, item) => sum + (finite(item.p_nom) ?? 0), 0);
  const reconciliation = {
    sourceAssetMW: capacityTotal(sourceAssets, 'p_nom'),
    projectedAssetMW: capacityTotal(projectedAssets, 'p_nom'),
    sourceAssetMWh: capacityTotal(sourceAssets, 'e_nom'),
    projectedAssetMWh: capacityTotal(projectedAssets, 'e_nom'),
    sourceLinkMW,
    projectedLinkMW,
    internalizedLinkMW: internalizedMW,
  };
  reconciliation.assetMWDelta = reconciliation.projectedAssetMW - reconciliation.sourceAssetMW;
  reconciliation.assetMWhDelta = reconciliation.projectedAssetMWh - reconciliation.sourceAssetMWh;
  reconciliation.linkMWDelta = reconciliation.projectedLinkMW + reconciliation.internalizedLinkMW - reconciliation.sourceLinkMW;
  const warnings = [];
  if (Math.abs(reconciliation.assetMWDelta) > 1e-6 || Math.abs(reconciliation.assetMWhDelta) > 1e-6) {
    warnings.push('Displayed asset capacities do not reconcile exactly to the mapped source facilities.');
  }
  if (Math.abs(reconciliation.linkMWDelta) > 1e-6) {
    warnings.push('Displayed plus internalized link capacity does not reconcile exactly to the mapped source links.');
  }
  return {
    schema: MODEL_MIXED_RESOLUTION_PREVIEW_SCHEMA,
    facilities: [...projectedNodes, ...projectedAssets],
    connections: projectedConnections,
    focus: null,
    meta: {
      ...scene.meta,
      preview: {
        label: 'Visual aggregation only · non-executable',
        sourceProjectId: scene.meta.projectId,
        sourceVersion: scene.meta.version,
        profile,
        counts: {
          sourceNodes: sourceNodes(scene).length,
          projectedNodes: projectedNodes.length,
          sourceAssets: sourceAssets.length,
          projectedAssets: projectedAssets.length,
          sourceLinks: (scene.connections || []).length,
          projectedLinks: projectedConnections.length,
          internalizedLinks: internalized.length,
        },
        internalized,
        reconciliation,
        warnings,
        capabilities: {
          mutatesSource: false,
          executable: false,
          canAggregate: true,
          canDisaggregate: false,
        },
      },
    },
  };
}

export function buildModelMixedResolutionPreview(scene, options = {}) {
  return buildModelResolutionPreview(scene, buildModelResolutionProfile(scene, options));
}

export function buildModelUniformResolutionPreview(scene, tier = 'country') {
  return buildModelResolutionPreview(scene, buildModelUniformResolutionProfile(scene, tier));
}
