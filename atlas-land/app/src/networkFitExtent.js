// Camera-only bounds for this European network workspace, not a data filter or
// a definition of country territory. Overseas assets remain loaded/drawable.
const inEuropeanExtent = ([lat, lng]) => lat >= 34 && lat <= 72 && lng >= -25 && lng <= 45;
const coordinate = value => typeof value === 'number' ? value
  : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;

// Camera extent only: source cluster polygons are not a replacement for a
// national boundary dataset or a land-constraint jurisdiction mask.
export function countryFitFeatures(countryCodes, countryGeoJson, overlays) {
  const requested = new Set((countryCodes || []).map(code => String(code || '').trim().toUpperCase()));
  const polygon = feature => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type);
  const national = (countryGeoJson?.features || []).filter(feature => polygon(feature)
    && requested.has(String(feature?.properties?.ISO2 || '').trim().toUpperCase()));
  const covered = new Set(national.map(feature => String(feature.properties.ISO2).trim().toUpperCase()));
  const fallback = (overlays || []).flatMap(overlay => {
    const code = String(overlay?.sourceCountryCode || '').trim().toUpperCase();
    if (!requested.has(code) || covered.has(code)) return [];
    return (overlay?.feature_collection?.features || []).filter(polygon);
  });
  return [...national, ...fallback];
}

export function networkFitPoints(facilities, { preferEurope = false } = {}) {
  const points = (Array.isArray(facilities) ? facilities : []).map(facility =>
    [coordinate(facility?.latitude), coordinate(facility?.longitude)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);
  if (!preferEurope) return points;
  const european = points.filter(inEuropeanExtent);
  // Never replace a genuinely non-European dataset with an empty/fictional view.
  return european.length ? european : points;
}
