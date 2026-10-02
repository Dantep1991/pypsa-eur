import { atlasApiUrl } from '../config/api';

export const objectResultTarget = selection => !['Node', 'Line', 'Region'].includes(selection.className)
  && selection.mapMode !== 'mix';

export async function fetchResultTopology(context, selection, options, fetchImpl) {
  const params = new URLSearchParams({ version: selection.modelVersion, class_name: selection.className });
  const response = await fetchImpl(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(context.projectId)}/flow-topology?${params}`, options.apiBase), { signal: options.signal });
  const topology = await response.json();
  if (!response.ok || topology.project_id !== context.projectId || topology.model_version !== selection.modelVersion
    || topology.class_name !== selection.className) throw new Error('Connection topology does not match this result model.');
  return topology;
}

export async function attachPipelinePositions(scene, context, selection, options, fetchImpl, suppliedTopology) {
  const topology = suppliedTopology || await fetchResultTopology(context, selection, options, fetchImpl);
  const ids = new Set(scene.values.map(row => row.entity_id));
  const observations = new Map(scene.values.map(row => [row.entity_id, row]));
  const invalidIds = new Set();
  let mismatched = 0;
  const lines = topology.lines.filter(line => {
    if (!ids.has(line.id) || !Array.isArray(line.coordinates) || line.coordinates.length < 2) return false;
    const row = observations.get(line.id);
    const agrees = !row.from_node || !row.to_node || (row.from_node === line.from_node && row.to_node === line.to_node)
      || (row.from_node === line.to_node && row.to_node === line.from_node);
    if (!agrees) { mismatched += 1; invalidIds.add(line.id); }
    return agrees;
  });
  const used = new Set(lines.flatMap(line => [line.from_node, line.to_node]));
  const spatialNodes = topology.nodes.filter(node => used.has(node.name) && node.position).map(node => ({
    id: node.id, name: node.name, type: 'node', carrier: 'result', component_type: node.id.split(':')[0],
    latitude: node.position.lat, longitude: node.position.lon,
    is_reference_topology: true, country: node.position_lineage?.country, data_source: node.position_lineage?.source || topology.source_refs?.join(', '),
    canonical_reference: node.position_lineage?.canonical_reference || `Node:${node.name}`,
  }));
  const spatialLinks = lines.map(line => ({ id: line.id, name: line.name, type: 'line', component_type: topology.class_name,
    from: `${line.node_class}:${line.from_node}`, to: `${line.node_class}:${line.to_node}`, coordinates: line.coordinates,
    category: line.category, is_reference_topology: true, carrier: 'result' }));
  const byId = new Map(lines.map(line => [line.id, line]));
  const values = scene.values.map(row => {
    const line = byId.get(row.entity_id);
    return { ...row, spatial_binding_valid: !invalidIds.has(row.entity_id),
      from_node: row.from_node || line?.from_node || '', to_node: row.to_node || line?.to_node || '' };
  });
  return { ...scene, values, valueByEntityId: new Map(values.map(row => [row.entity_id, row])),
    coverage: { ...scene.coverage, endpoint_mismatch_count: mismatched }, spatial_nodes: spatialNodes, spatial_links: spatialLinks };
}

export async function fetchResultAssets(context, version, className, options, fetchImpl) {
  const params = new URLSearchParams({ version, ...(className ? { class_name: className } : {}) });
  const response = await fetchImpl(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(context.projectId)}/assets?${params}`, options.apiBase), {
    signal: options.signal, credentials: 'same-origin',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Model coordinate catalogue unavailable.');
  if (payload.project_id !== context.projectId || payload.model_version !== version) throw new Error('Coordinate catalogue belongs to another model.');
  return payload;
}

export function attachAssetPositions(scene, assets) {
  const byName = new Map();
  for (const obj of assets.objects || []) {
    if (byName.has(obj.name)) byName.set(obj.name, null); // Ambiguous names are not guessed.
    else byName.set(obj.name, obj);
  }
  const spatialNodes = scene.values.flatMap(row => {
    const obj = byName.get(row.object_name || row.entity_id.slice(row.entity_id.indexOf(':') + 1));
    const nodes = obj?.nodes || [];
    const positions = nodes.map(node => node.position).filter(Boolean);
    if (!positions.length || nodes.length !== positions.length) return [];
    const distinct = new Set(positions.map(point => `${point.lat},${point.lon}`));
    if (distinct.size !== 1) return []; // A multi-node object has no unique point.
    const point = positions[0];
    return [{ id: row.entity_id, name: obj.name, component_type: obj.class_name,
      type: 'node', carrier: 'result', latitude: point.lat, longitude: point.lon,
      is_reference_topology: true,
      canonical_reference: point.canonical_reference || `Node:${nodes[0].name}`,
      data_source: assets.source, source: assets.source,
      properties: [{ Property: 'Coordinate method', Value: point.method },
        { Property: 'Coordinate reference', Value: point.canonical_reference || nodes[0].name }],
    }];
  });
  return { ...scene, spatial_nodes: spatialNodes };
}
