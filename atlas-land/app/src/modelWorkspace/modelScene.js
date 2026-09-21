export const MODEL_SCENE_SCHEMA = 'nohm.atlas.model-scene.v1';

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
  if (Number.isInteger(Number(year))) query.set('year', String(Number(year)));
  return `/api/emil/atlas/projects/${encodeURIComponent(projectId)}/scene?${query.toString()}`;
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
    carrier: scene.carrier || 'electricity',
    atlas_domain: 'Grid',
    color: '#2dd4bf',
    opacity: 0.82,
    p_nom: capacityUnit === 'MW' ? capacity : null,
    capacity_units: capacityUnit || null,
    is_reference_topology: true,
    source_model_project: scene.project_id,
    source_model_version: scene.version,
    properties: [
      { Property: 'Source ID', Value: link.source_id || link.id, Units: '' },
      { Property: 'Model category', Value: link.category || '', Units: '' },
      { Property: 'From node', Value: link.from_node || '', Units: '' },
      { Property: 'To node', Value: link.to_node || '', Units: '' },
      ...capacityProperties(link.capacity),
    ],
  };
}

export function adaptModelScene(scene, expectedProjectId = '') {
  if (!scene || scene.schema !== MODEL_SCENE_SCHEMA) {
    throw new Error('Atlas received an unsupported model-scene response.');
  }
  if (expectedProjectId && scene.project_id !== expectedProjectId) {
    throw new Error(
      `Atlas requested ${expectedProjectId} but received model data for ${scene.project_id || 'another project'}.`,
    );
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
      selectedYear: scene.selected_year,
      countries,
      nodeCount: Number(scene.coverage?.counts?.nodes || 0),
      mappedNodeCount: Number(scene.coverage?.counts?.mapped_nodes || 0),
      linkCount: Number(scene.coverage?.counts?.links || 0),
      assetCount: Number(scene.coverage?.counts?.assets || 0),
      warnings: Array.isArray(scene.coverage?.warnings) ? scene.coverage.warnings : [],
    },
  };
}

export async function fetchModelScene(context, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = modelSceneRequestUrl(context, options);
  if (!url) throw new Error('A bound model project is required to load an Atlas model scene.');
  const response = await fetchImpl(url, { signal: options.signal, credentials: 'same-origin' });
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
  return adaptModelScene(payload, context.projectId);
}
