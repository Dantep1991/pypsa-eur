import { connectionGeometry } from '../atlasMapGeometry';

const key = value => String(value ?? '').trim().toUpperCase();
const nodeKeys = node => [node.id, node.name, node.source_id, node.position?.canonical_reference].map(key).filter(Boolean);

// One display-only scope for topology and independently loaded data layers.
// Countries come from published memberships, never ID prefixes or coordinates.
// Keep the unfiltered frames intact so Select all restores them from memory.
export function scopeModelCountryView({ countries = [], sourceNodes = [], sourceLinks = [],
  facilities = [], connections = [], assetsFrame = null, flowFrame = null, cbaScene = null }) {
  const selected = new Set(countries.map(key).filter(Boolean));
  const original = { facilities, connections, assetsFrame, flowFrame, cbaScene };
  if (!selected.size) return original;
  const nodeCountries = new Map(), links = new Map(), positions = new Map();
  for (const node of [...sourceNodes, ...facilities]) {
    const latitude = node.latitude ?? node.position?.lat, longitude = node.longitude ?? node.position?.lon;
    if (latitude != null && longitude != null) {
      for (const id of nodeKeys(node)) {
        const position = { latitude, longitude }, old = positions.get(id);
        if (old === undefined) positions.set(id, position);
        else if (!old || Number(old.latitude) !== Number(latitude) || Number(old.longitude) !== Number(longitude)) positions.set(id, null);
      }
    }
    const country = key(node.country || node.country_code);
    if (!country) continue;
    for (const id of nodeKeys(node)) {
      const bucket = nodeCountries.get(id) || new Set();
      bucket.add(country); nodeCountries.set(id, bucket);
    }
  }
  for (const line of [...sourceLinks, ...connections]) {
    for (const id of [line.id, line.name].map(key).filter(Boolean)) {
      const old = links.get(id);
      // A typed canonical ID is authoritative; ambiguous name aliases fail closed.
      if (old === undefined) links.set(id, line);
      else if (old?.id !== line.id) links.set(id, null);
    }
  }
  const includedNode = node => {
    if (typeof node === 'string') {
      const known = nodeCountries.get(key(node));
      return known?.size === 1 && selected.has([...known][0]);
    }
    if (!node) return false;
    const country = key(node.country || node.country_code);
    if (country) return selected.has(country);
    return nodeKeys(node).some(id => includedNode(id)) || includedNode(node.canonical_reference)
      || includedNode(node.bus || node.node_id || node.nodeId);
  };
  const includedLine = line => {
    const published = links.get(key(line.id)) || links.get(key(line.name));
    const record = published || line;
    return [record.from_node, record.to_node, record.from, record.to, record.fromNode, record.toNode,
      record.actualFrom, record.actualTo].some(node => includedNode(node));
  };
  const retainLineGeometry = line => {
    if (Array.isArray(line.coordinates) || Array.isArray(line.coordinate_paths)) return line;
    // Resolve against the complete source before hiding outside endpoint dots.
    // Otherwise a retained border connection disappears from the renderer.
    const geometry = connectionGeometry({ ...line, from: line.from || line.from_node || line.fromNode,
      to: line.to || line.to_node || line.toNode }, id => positions.get(key(id)));
    return geometry ? { ...line, coordinates: geometry.coordinates } : line;
  };
  const scopedFacilities = facilities.filter(includedNode).map(node => {
    if (!Array.isArray(node.sameLocationFacilities)) return node;
    const members = node.sameLocationFacilities.filter(includedNode);
    return { ...node, sameLocationFacilities: members, sameLocationCount: members.length };
  });
  let scopedAssets = assetsFrame;
  if (assetsFrame) {
    const markers = assetsFrame.markers.flatMap(marker => {
      const nodes = (marker.nodes || []).filter(includedNode);
      if (!nodes.length) return [];
      const markerIds = new Set(nodes.map(node => key(node.id)));
      const objects = (marker.objects || []).flatMap(obj => {
        const memberships = (obj.nodes || []).filter(includedNode);
        return memberships.some(node => markerIds.has(key(node.id))) ? [{ ...obj, nodes: memberships }] : [];
      });
      if (!objects.length) return [];
      const measured = objects.filter(obj => Number.isFinite(obj.measurement?.value));
      return [{ ...marker, nodes, objects, measured: measured.length,
        maximum: Math.max(0, ...measured.map(obj => Math.abs(obj.measurement.value))) }];
    });
    const units = new Set(markers.flatMap(marker => marker.objects).filter(obj => Number.isFinite(obj.measurement?.value))
      .map(obj => obj.measurement.unit || ''));
    scopedAssets = { ...assetsFrame, markers, maximum: Math.max(0, ...markers.map(marker => marker.maximum)),
      hasValues: units.size === 1, incompatibleUnits: units.size > 1,
      selectedId: markers.some(marker => marker.objects.some(obj => obj.id === assetsFrame.selectedId)) ? assetsFrame.selectedId : '' };
  }
  let scopedFlows = flowFrame;
  if (flowFrame) {
    const lines = flowFrame.lines.filter(includedLine);
    scopedFlows = { ...flowFrame, lines, maximum: Math.max(0, ...lines.map(line => Math.abs(line.value))),
      selectedId: lines.some(line => line.id === flowFrame.selectedId) ? flowFrame.selectedId : '' };
  }
  let scopedCba = cbaScene;
  if (cbaScene) {
    const points = cbaScene.points.filter(includedNode), lines = cbaScene.lines.filter(includedLine);
    scopedCba = { ...cbaScene, points, lines, viewCountries: [...selected],
      coverage: { ...cbaScene.coverage, mapped: points.length + lines.length,
        excludedByCountry: cbaScene.points.length + cbaScene.lines.length - points.length - lines.length } };
  }
  return { facilities: scopedFacilities, connections: connections.filter(includedLine).map(retainLineGeometry),
    assetsFrame: scopedAssets, flowFrame: scopedFlows, cbaScene: scopedCba };
}
