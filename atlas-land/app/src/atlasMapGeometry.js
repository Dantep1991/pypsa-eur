const validCoordinate = ([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)
  && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
const coordinateNumber = value => typeof value === 'number' ? value
  : value == null || typeof value === 'boolean' || String(value).trim() === '' ? NaN : Number(value);

// Leaflet clips and simplifies each route in screen pixels, retaining its end
// points. Reduce sub-pixel bends at overview zooms, never whole network links.
export const routeSmoothingForZoom = (zoom) => (
  zoom <= 5 ? 2 : zoom <= 7 ? 1.5 : zoom <= 9 ? 1 : 0.5
);

function boundedGeometry(coordinates, bounds) {
  const { west, south, east, north } = bounds;
  if (west === east && south === north) return null;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return { coordinates, bounds, fromLng: first[0], fromLat: first[1], toLng: last[0], toLat: last[1] };
}

function routedGeometry(coordinates) {
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  coordinates.forEach(([lng, lat]) => {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  });
  return boundedGeometry(coordinates, { west, south, east, north });
}

function sourceGeometry(source) {
  // API route snapshots are immutable, and Leaflet constructs its own LatLngs.
  // Validate and accumulate bounds in one pass. Allocate a sanitized copy only
  // when a coordinate needs conversion/removal, not for every valid vertex.
  let sanitized = null;
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  for (let index = 0; index < source.length; index += 1) {
    const point = source[index];
    const lng = coordinateNumber(point?.[0]);
    const lat = coordinateNumber(point?.[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
      const unchanged = Array.isArray(point) && point.length === 2 && point[0] === lng && point[1] === lat;
      if (!unchanged && !sanitized) sanitized = source.slice(0, index);
      if (sanitized) sanitized.push(unchanged ? point : [lng, lat]);
      west = Math.min(west, lng); east = Math.max(east, lng);
      south = Math.min(south, lat); north = Math.max(north, lat);
    } else if (!sanitized) sanitized = source.slice(0, index);
  }
  const coordinates = sanitized || source;
  // Distinguish an unusable source (resolve actual endpoints) from a genuine
  // coincident route (unmapped; do not invent a different shape).
  return { hasRoute: coordinates.length >= 2,
    geometry: coordinates.length >= 2 ? boundedGeometry(coordinates, { west, south, east, north }) : null };
}

function endpointGeometry(connection, resolveNode) {
  const from = resolveNode(connection.from);
  const to = resolveNode(connection.to);
  if (!from || !to) return null;
  const coordinates = [[coordinateNumber(from.longitude), coordinateNumber(from.latitude)], [coordinateNumber(to.longitude), coordinateNumber(to.latitude)]];
  return coordinates.every(validCoordinate) ? routedGeometry(coordinates) : null;
}

function multipartGeometry(paths) {
  // Multipart rivers/pipelines are separate paths, never a concatenated line:
  // joining them would invent segments between disconnected source branches.
  const parts = paths.filter(Array.isArray).map(path => sourceGeometry(path).geometry).filter(Boolean);
  if (!parts.length) return null;
  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  // Compact per-path bounds avoid retaining another object for each of the
  // hundreds of thousands of source branches in a Europe-wide water view.
  const pathBounds = new Float64Array(parts.length * 4);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    pathBounds.set([part.bounds.west, part.bounds.south, part.bounds.east, part.bounds.north], index * 4);
    bounds.west = Math.min(bounds.west, part.bounds.west);
    bounds.south = Math.min(bounds.south, part.bounds.south);
    bounds.east = Math.max(bounds.east, part.bounds.east);
    bounds.north = Math.max(bounds.north, part.bounds.north);
  }
  return { ...parts[0], type: 'MultiLineString', coordinates: parts.map(part => part.coordinates), bounds, pathBounds };
}

export function connectionGeometry(connection, resolveNode) {
  if (Array.isArray(connection.coordinate_paths)) return multipartGeometry(connection.coordinate_paths);
  const direct = sourceGeometry(Array.isArray(connection.coordinates) ? connection.coordinates : []);
  return direct.hasRoute ? direct.geometry : endpointGeometry(connection, resolveNode);
}

// Source route arrays are immutable input snapshots. Reuse their validated
// geometry when another carrier/layer changes; never cache endpoint-derived
// lines because the selected network may have moved/replaced those buses.
// Weak keys let removed country/carrier datasets be garbage-collected.
export function createConnectionGeometryResolver() {
  const cache = new WeakMap();
  return (connection, resolveNode) => {
    if (Array.isArray(connection.coordinate_paths)) {
      if (!cache.has(connection.coordinate_paths)) cache.set(connection.coordinate_paths, multipartGeometry(connection.coordinate_paths));
      return cache.get(connection.coordinate_paths);
    }
    if (Array.isArray(connection.coordinates)) {
      if (!cache.has(connection.coordinates)) cache.set(connection.coordinates, sourceGeometry(connection.coordinates));
      const direct = cache.get(connection.coordinates);
      if (direct.hasRoute) return direct.geometry;
    }
    return endpointGeometry(connection, resolveNode);
  };
}

function normalizedViewport(viewport) {
  // Leaflet can expose wrapped longitudes after panning. Normalize the view,
  // preserving crossing routes even when both endpoints are off screen.
  const width = viewport.east - viewport.west;
  const viewWest = ((viewport.west + 180) % 360 + 360) % 360 - 180;
  const viewEast = viewWest + (width < 0 ? width + 360 : width);
  return { west: viewWest, east: viewEast, south: viewport.south, north: viewport.north, global: width >= 360 };
}

function boundsIntersect(west, south, east, north, viewport) {
  if (north < viewport.south || south > viewport.north) return false;
  return viewport.global || (viewport.east > 180
    ? east >= viewport.west || west <= viewport.east - 360
    : east >= viewport.west && west <= viewport.east);
}

export function geometryIntersectsViewport(geometry, viewport) {
  if (!geometry) return false;
  if (!viewport) return true;
  const { west, south, east, north } = geometry.bounds;
  return boundsIntersect(west, south, east, north, normalizedViewport(viewport));
}

// Keep only in-view multipart paths in Leaflet, not just in-view river records.
// Bounds are conservative: crossing paths survive even with endpoints outside.
// Cache one selection per weak source key, never every historical pan/zoom.
export function createViewportGeometrySelector() {
  const cache = new WeakMap();
  return (geometry, viewport) => {
    if (!geometryIntersectsViewport(geometry, viewport)) return null;
    if (!viewport || geometry.type !== 'MultiLineString' || !geometry.pathBounds) return geometry;
    const view = normalizedViewport(viewport);
    const extent = geometry.bounds;
    if (extent.south >= view.south && extent.north <= view.north && (view.global
      || (extent.west >= view.west && extent.east <= view.east)
      || (view.east > 180 && extent.west >= -180 && extent.east <= view.east - 360))) {
      cache.delete(geometry);
      return geometry;
    }
    const { coordinates, pathBounds } = geometry;
    let indices = null;
    for (let index = 0; index < coordinates.length; index += 1) {
      const offset = index * 4;
      if (boundsIntersect(pathBounds[offset], pathBounds[offset + 1], pathBounds[offset + 2], pathBounds[offset + 3], view)) {
        if (indices) indices.push(index);
      } else if (!indices) indices = Array.from({ length: index }, (_, value) => value);
    }
    if (!indices) { cache.delete(geometry); return geometry; }
    if (!indices.length) { cache.delete(geometry); return null; }
    const previous = cache.get(geometry);
    if (previous && previous.coordinates.length === indices.length
      && indices.every((index, position) => coordinates[index] === previous.coordinates[position])) return previous;
    const selected = indices.map(index => coordinates[index]);
    const selectedBounds = new Float64Array(indices.length * 4);
    const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
    indices.forEach((index, position) => {
      const offset = index * 4;
      const west = pathBounds[offset]; const south = pathBounds[offset + 1];
      const east = pathBounds[offset + 2]; const north = pathBounds[offset + 3];
      selectedBounds.set(pathBounds.subarray(offset, offset + 4), position * 4);
      bounds.west = Math.min(bounds.west, west); bounds.south = Math.min(bounds.south, south);
      bounds.east = Math.max(bounds.east, east); bounds.north = Math.max(bounds.north, north);
    });
    const first = selected[0][0]; const last = selected[0][selected[0].length - 1];
    const result = { type: 'MultiLineString', coordinates: selected, pathBounds: selectedBounds, bounds,
      fromLng: first[0], fromLat: first[1], toLng: last[0], toLat: last[1] };
    cache.set(geometry, result);
    return result;
  };
}
