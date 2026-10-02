import { atlasApiUrl } from '../config/api';
import { bindAggregationCatalog } from './modelAggregation';

export const MODEL_SCENE_SCHEMA = 'nohm.atlas.model-scene.v1';
export const MODEL_SCENE_DOMAINS = Object.freeze(['Grid', 'Supply', 'Storage']);

export function isModelSceneDomain(domain) {
  return MODEL_SCENE_DOMAINS.includes(text(domain));
}

export function resolveModelSceneDomains(currentVisibility = {}, requestedDomains = [], mode = 'replace') {
  const requested = [...new Set(requestedDomains.map((domain) => text(domain)).filter(Boolean))];
  const unsupported = requested.filter((domain) => !MODEL_SCENE_DOMAINS.includes(domain));
  if (unsupported.length) {
    throw new Error(`${unsupported.join(' and ')} is not available in the current canonical model scene.`);
  }
  const enabled = new Set(MODEL_SCENE_DOMAINS.filter((domain) => Boolean(currentVisibility[domain])));
  if (mode === 'hide') requested.forEach((domain) => enabled.delete(domain));
  else if (mode === 'add') requested.forEach((domain) => enabled.add(domain));
  else {
    enabled.clear();
    requested.forEach((domain) => enabled.add(domain));
  }
  const enabledDomains = MODEL_SCENE_DOMAINS.filter((domain) => enabled.has(domain));
  return {
    enabledDomains,
    layers: [
      'grid',
      ...(enabled.has('Supply') ? ['supply'] : []),
      ...(enabled.has('Storage') ? ['storage'] : []),
    ],
    visibility: Object.fromEntries(MODEL_SCENE_DOMAINS.map((domain) => [domain, enabled.has(domain)])),
  };
}

const text = (value) => String(value ?? '').trim();
const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function modelSceneRequestUrl(context, { layers = ['grid'], year = null } = {}) {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId) return null;
  const query = new URLSearchParams({
    carrier: 'electricity',
    layers: [...new Set(layers.map((value) => text(value).toLowerCase()).filter(Boolean))].join(',') || 'grid',
  });
  if (text(context.version)) query.set('version', text(context.version));
  if (text(year) && Number.isInteger(Number(year))) query.set('year', String(Number(year)));
  return `/api/atlas/projects/${encodeURIComponent(projectId)}/scene?${query.toString()}`;
}

function propertiesForNode(node) {
  return [
    { Property: 'Source ID', Value: node.source_id || node.id, Units: '' },
    { Property: 'Model category', Value: node.category || '', Units: '' },
    { Property: 'Country', Value: node.country || '', Units: '' },
    { Property: 'Map role', Value: node.role || '', Units: '' },
    { Property: 'Coordinate source', Value: node.position_lineage?.source || '', Units: '' },
  ];
}

function capacityProperties(capacity) {
  if (!capacity) return [];
  return [
    { Property: capacity.property || 'Capacity', Value: capacity.value, Units: capacity.unit || '' },
    ...(capacity.year ? [{ Property: 'Capacity year', Value: capacity.year, Units: '' }] : []),
  ];
}

function mappedNodeFacility(node, scene) {
  const latitude = finite(node?.position?.lat);
  const longitude = finite(node?.position?.lon);
  if (latitude == null || longitude == null) return null;
  return {
    id: node.id,
    name: node.name || node.id,
    nodeId: node.id,
    parentName: node.name || node.id,
    latitude,
    longitude,
    country: node.country || '',
    region: node.country || '',
    type: 'Bus',
    component_type: 'Bus',
    carrier: scene.carrier || 'electricity',
    carrier_key: 'bus',
    carrier_nice_name: 'Model node',
    carrier_color: '#5eead4',
    atlas_domain: 'Grid',
    editable: false,
    is_virtual: false,
    source_model_project: scene.project_id,
    source_model_version: scene.version,
    membership: {
      collection: 'Canonical model schema',
      parentClass: 'Node',
      childClass: 'Node',
      parentCategory: node.category || '',
      childCategory: node.category || '',
    },
    properties: propertiesForNode(node),
  };
}

function assetFacility(asset, scene, nodeById) {
  const node = (asset.node_ids || []).map((nodeId) => nodeById.get(nodeId)).find(Boolean);
  const latitude = finite(node?.position?.lat);
  const longitude = finite(node?.position?.lon);
  if (!node || latitude == null || longitude == null) return null;
  const componentType = asset.class_name === 'Generator' ? 'Generator' : 'StorageUnit';
  const capacity = finite(asset.capacity?.value);
  return {
    id: asset.id,
    name: asset.name || asset.id,
    nodeId: asset.id,
    parentName: asset.name || asset.id,
    latitude,
    longitude,
    country: node.country || '',
    region: node.country || '',
    bus: node.id,
    type: asset.category || componentType,
    component_type: componentType,
    carrier: asset.category || scene.carrier || '',
    carrier_key: text(asset.category || componentType).toLowerCase().replace(/\s+/g, '_'),
    carrier_nice_name: asset.category || componentType,
    atlas_domain: asset.layer === 'storage' ? 'Storage' : 'Supply',
    p_nom: componentType === 'Generator' && asset.capacity?.unit === 'MW' ? capacity : null,
    e_nom: componentType === 'StorageUnit' && asset.capacity?.unit === 'MWh' ? capacity : null,
    editable: false,
    is_virtual: false,
    source_model_project: scene.project_id,
    source_model_version: scene.version,
    membership: {
      collection: 'Canonical model schema',
      parentClass: asset.class_name,
      childClass: 'Node',
      parentCategory: asset.category || '',
      childCategory: node.category || '',
    },
    properties: [
      { Property: 'Source ID', Value: asset.source_id || asset.id, Units: '' },
      { Property: 'Model category', Value: asset.category || '', Units: '' },
      { Property: 'Node', Value: node.id, Units: '' },
      ...capacityProperties(asset.capacity),
    ],
  };
}

function modelConnection(link, scene) {
  const capacity = finite(link?.capacity?.value);
  const capacityUnit = text(link?.capacity?.unit);
  return {
    id: link.id,
    name: link.name || link.id,
    from: link.from_node,
    to: link.to_node,
    fromNode: link.from_node,
    toNode: link.to_node,
    type: 'line',
    component_type: 'Line',
    collection: 'Lines',
    category: link.category || '',
    carrier: scene.carrier || 'electricity',
    atlas_domain: 'Grid',
    color: '#2dd4bf',
    opacity: 0.82,
    p_nom: capacityUnit === 'MW' ? capacity : null,
    capacity_units: capacityUnit || null,
    is_reference_topology: true,
    source_model_project: scene.project_id,
    source_model_version: scene.version,
    membership: {
      collection: 'Canonical model schema',
      parentClass: 'Line',
      childClass: 'Node',
      parentCategory: link.category || '',
      childCategory: '',
    },
    properties: [
      { Property: 'Source ID', Value: link.source_id || link.id, Units: '' },
      { Property: 'Model category', Value: link.category || '', Units: '' },
      { Property: 'From node', Value: link.from_node || '', Units: '' },
      { Property: 'To node', Value: link.to_node || '', Units: '' },
      ...capacityProperties(link.capacity),
    ],
  };
}

export function adaptModelScene(scene, expectedProjectId = '', expectedVersion = '') {
  if (!scene || scene.schema !== MODEL_SCENE_SCHEMA) {
    throw new Error('Atlas received an unsupported model-scene response.');
  }
  if (expectedProjectId && scene.project_id !== expectedProjectId) {
    throw new Error(
      `Atlas requested ${expectedProjectId} but received model data for ${scene.project_id || 'another project'}.`,
    );
  }
  const version = text(expectedVersion);
  const explicitAlias = scene.version_binding?.requested_version === version
    && scene.version_binding?.schema_version === scene.version
    && scene.version_binding?.source === 'project_meta/run_history.json';
  if (version && version.toLowerCase() !== 'latest' && scene.version !== version && !explicitAlias) {
    throw new Error(`Atlas requested model version ${version} but received ${scene.version || 'an unspecified version'}.`);
  }
  const nodeById = new Map((scene.nodes || []).map((node) => [node.id, node]));
  const nodeFacilities = (scene.nodes || []).map((node) => mappedNodeFacility(node, scene)).filter(Boolean);
  const assetFacilities = (scene.assets || []).map((asset) => assetFacility(asset, scene, nodeById)).filter(Boolean);
  const facilities = [...nodeFacilities, ...assetFacilities];
  const connections = (scene.links || []).map((link) => modelConnection(link, scene));
  const countries = [...new Set((scene.nodes || []).map((node) => text(node.country)).filter(Boolean))].sort();
  const positions = nodeFacilities.map((node) => ({ lat: finite(node.latitude), lon: finite(node.longitude) }));
  const focus = positions.length ? {
    latitude: positions.reduce((sum, point) => sum + point.lat, 0) / positions.length,
    longitude: positions.reduce((sum, point) => sum + point.lon, 0) / positions.length,
    zoom: 4,
    label: `${scene.project_id} · ${scene.version}`,
  } : null;
  return {
    scene,
    facilities,
    connections,
    focus,
    meta: {
      projectId: scene.project_id,
      version: scene.version,
      temporary: scene.temporary === true,
      draftId: text(scene.draft_id) || null,
      sourceVersion: text(scene.source_version) || null,
      draftRevision: Number.isSafeInteger(Number(scene.draft_revision)) ? Number(scene.draft_revision) : null,
      previewId: text(scene.preview_id) || null,
      selectedYear: scene.selected_year,
      layers: Array.isArray(scene.layers) ? scene.layers : [],
      countries,
      nodeCount: Number(scene.coverage?.counts?.nodes || 0),
      mappedNodeCount: Number(scene.coverage?.counts?.mapped_nodes || 0),
      linkCount: Number(scene.coverage?.counts?.links || 0),
      assetCount: Number(scene.coverage?.counts?.assets || 0),
      warnings: Array.isArray(scene.coverage?.warnings) ? scene.coverage.warnings : [],
      declaredCategories: scene.manifest?.declared_categories || {},
      declaredCategoryCounts: scene.manifest?.declared_category_counts || {},
      declaredCategoryObjects: scene.manifest?.declared_category_objects || {},
    },
  };
}

export async function fetchModelScene(context, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = modelSceneRequestUrl(context, options);
  if (!url) throw new Error('A bound model project is required to load an Atlas model scene.');
  const response = await fetchImpl(atlasApiUrl(url, options.apiBase), { signal: options.signal, credentials: 'same-origin' });
  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new Error(`Atlas could not read the model scene (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `HTTP ${response.status}`;
    throw new Error(`Atlas could not load the bound model: ${detail}`);
  }
  const scene = adaptModelScene(payload, context.projectId, context.version);
  const catalogUrl = `/api/atlas/projects/${encodeURIComponent(context.projectId)}/aggregation-catalog?version=${encodeURIComponent(scene.meta.version)}`;
  let catalog;
  try {
    const catalogResponse = await fetchImpl(atlasApiUrl(catalogUrl, options.apiBase), { signal: options.signal, credentials: 'same-origin' });
    if (!catalogResponse.ok) throw new Error(`HTTP ${catalogResponse.status}`);
    catalog = await catalogResponse.json();
  } catch (error) {
    if (options.signal?.aborted || error.name === 'AbortError') throw error;
    // A missing crosswalk disables aggregation, never the source model itself.
    return { ...scene, meta: { ...scene.meta, warnings: [...scene.meta.warnings,
      `Geography aggregation unavailable: ${error.message}. Native topology retained.`] } };
  }
  return bindAggregationCatalog(scene, catalog);
}
