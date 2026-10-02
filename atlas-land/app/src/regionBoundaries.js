const PALETTE = ['#0d9488', '#7c3aed', '#2563eb', '#d97706', '#db2777', '#059669'];

// Group real country polygons; never draw a convex hull across sea or neighbours.
// Member borders remain visible: this is a membership overlay, not a GIS dissolve.
export function regionBoundaryCollection(geojson, regions = []) {
  return { type: 'FeatureCollection', features: regions.flatMap((region, index) => {
    const members = (geojson?.features || []).filter(feature => region.countryCodes.includes(feature.properties?.ISO2));
    if (!region.countryCodes.every(code => members.some(feature => feature.properties?.ISO2 === code))) return [];
    const coordinates = members.flatMap(feature => feature.geometry?.type === 'Polygon'
      ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : []);
    if (!coordinates.length) return [];
    return [{ type: 'Feature', properties: { name: region.name, countries: region.countryCodes.join(', '),
      color: PALETTE[index % PALETTE.length] }, geometry: { type: 'MultiPolygon', coordinates } }];
  }) };
}

export function nodeHoverText(node) {
  const parts = [node.atlas_region_group_name || node.name || node.id || 'Node'];
  if (node.atlas_region_group_name) {
    parts.push(`Countries: ${(node.country_codes || []).join(', ')}`);
    parts.push('Visual aggregation');
  } else {
    if (node.component_type || node.type) parts.push(node.component_type || node.type);
    if (node.country) parts.push(node.country);
    if (node.carrier_nice_name || node.carrier) parts.push(node.carrier_nice_name || node.carrier);
  }
  return parts.join(' · ');
}
