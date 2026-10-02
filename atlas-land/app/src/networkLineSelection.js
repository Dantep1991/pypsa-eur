// Select the committed, displayed geometry, never a guessed straight route.
// The inexpensive geographic bounds filter avoids projecting the entire grid
// for each click. Hit tolerance is in screen pixels, independent of zoom.
export function createNetworkLinePicker(collection) {
  const paths = [];
  for (const feature of collection?.features || []) {
    const geometry = feature.geometry;
    const connection = feature.properties?.connection;
    if (!connection || !['LineString', 'MultiLineString'].includes(geometry?.type)) continue;
    for (const coordinates of geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates]) {
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
      const valid = coordinates.filter(point => Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite));
      if (valid.length < 2) continue;
      const bounds = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
      for (const [lng, lat] of valid) {
        bounds.west = Math.min(bounds.west, lng); bounds.east = Math.max(bounds.east, lng);
        bounds.south = Math.min(bounds.south, lat); bounds.north = Math.max(bounds.north, lat);
      }
      paths.push({ coordinates, connection, ...bounds });
    }
  }
  return (point, map, tolerance = 10) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !map?.latLngToContainerPoint) return null;
    const low = map.containerPointToLatLng?.([point.x - tolerance, point.y + tolerance]);
    const high = map.containerPointToLatLng?.([point.x + tolerance, point.y - tolerance]);
    let closest = null; let distance = tolerance * tolerance;
    for (const path of paths) {
      if (low && high && (path.west > high.lng || path.east < low.lng || path.south > high.lat || path.north < low.lat)) continue;
      for (let index = 1; index < path.coordinates.length; index += 1) {
        const a = path.coordinates[index - 1]; const b = path.coordinates[index];
        if (![a, b].every(value => Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every(Number.isFinite))) continue;
        const start = map.latLngToContainerPoint([a[1], a[0]]); const end = map.latLngToContainerPoint([b[1], b[0]]);
        const dx = end.x - start.x; const dy = end.y - start.y;
        const length = dx * dx + dy * dy;
        const fraction = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
        const squared = (point.x - start.x - fraction * dx) ** 2 + (point.y - start.y - fraction * dy) ** 2;
        if (squared <= distance) { distance = squared; closest = path.connection; }
      }
    }
    return closest;
  };
}
