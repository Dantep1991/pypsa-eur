const PALETTE = ['#0d9488', '#7c3aed', '#2563eb', '#d97706', '#db2777', '#059669'];

// Group real country polygons; never draw a convex hull across sea or neighbours.
// Member borders remain visible: this is a membership overlay, not a GIS dissolve.
// Missing geometry must not hide the available countries or be called complete.
export function regionBoundaryCollection(geojson, regions = []) {
  const incomplete = [];
  const features = regions.flatMap((region, index) => {
    const countryCodes = [...new Set(region.countryCodes || [])];
    const members = (geojson?.features || []).filter(feature => countryCodes.includes(feature.properties?.ISO2)
      && ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) && feature.geometry.coordinates?.length);
    const shownCountries = countryCodes.filter(code => members.some(feature => feature.properties?.ISO2 === code));
    const missingCountries = countryCodes.filter(code => !shownCountries.includes(code));
    if (missingCountries.length) incomplete.push({ id: region.id, name: region.name,
      shownCountries, missingCountries, total: countryCodes.length });
    const coordinates = members.flatMap(feature => feature.geometry?.type === 'Polygon'
      ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : []);
    if (!coordinates.length) return [];
    return [{ type: 'Feature', properties: { name: region.name, countries: countryCodes.join(', '),
      shownCountries, missingCountries, boundaryComplete: !missingCountries.length,
      color: PALETTE[index % PALETTE.length] }, geometry: { type: 'MultiPolygon', coordinates } }];
  });
  return { type: 'FeatureCollection', features, incomplete };
}

export function regionBoundaryTooltip(feature) {
  const { name, countries, shownCountries = [], missingCountries = [] } = feature.properties;
  const coverage = missingCountries.length
    ? ` · Outlines shown: ${shownCountries.length}/${shownCountries.length + missingCountries.length} · Missing outline: ${missingCountries.join(', ')}` : '';
  return `${name} · Countries: ${countries}${coverage}`;
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
