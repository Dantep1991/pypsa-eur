import L from 'leaflet';
import { connectionGeometry, createConnectionGeometryResolver, createViewportGeometrySelector, geometryIntersectsViewport, routeSmoothingForZoom } from './atlasMapGeometry';

const view = { west: -1, east: 1, south: -1, north: 1 };
const route = (coordinates) => connectionGeometry({ coordinates }, () => null);

test('multipart routes retain separate branches, including valid paths after a coincident first path', () => {
  const paths = Object.freeze([
    Object.freeze([Object.freeze([2, 48]), Object.freeze([2, 48])]),
    Object.freeze([Object.freeze([3, 49]), Object.freeze([4, 50])]),
    Object.freeze([Object.freeze([9, 55]), Object.freeze([10, 56]), Object.freeze([9, 55])]),
  ]);
  const resolveNode = jest.fn();
  const resolver = createConnectionGeometryResolver();
  const link = { coordinates: paths[0], coordinate_paths: paths };
  const geometry = resolver(link, resolveNode);
  expect(geometry).toEqual(connectionGeometry(link, resolveNode));
  expect(geometry.type).toBe('MultiLineString');
  expect(geometry.coordinates).toEqual([paths[1], paths[2]]);
  expect(geometry.coordinates[0]).toBe(paths[1]);
  expect(geometry.bounds).toEqual({ west: 3, east: 10, south: 49, north: 56 });
  expect(resolver({ ...link, name: 'renamed' }, jest.fn())).toBe(geometry);
  expect(resolveNode).not.toHaveBeenCalled();
  expect(geometryIntersectsViewport(geometry, { west: 8, east: 11, south: 54, north: 57 })).toBe(true);
  const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: { type: geometry.type, coordinates: geometry.coordinates } });
  expect(layer.getLayers()).toHaveLength(1);
  const rendered = layer.getLayers()[0].getLatLngs();
  expect(rendered.map(path => path.map(point => [point.lng, point.lat]))).toEqual([paths[1], paths[2]]);
  expect(rendered.map(path => path.length)).toEqual([2, 3]);
});

test('multipart source authority never fabricates a straight line from legacy fallback endpoints', () => {
  for (const paths of [[], [[[2, 48], [2, 48]]], [null, [['bad', 1], [null, 2]]]]) {
    const resolve = jest.fn(() => ({ longitude: 3, latitude: 49 }));
    const link = { coordinate_paths: paths, coordinates: [[2, 48], [3, 49]], from: 'a', to: 'b' };
    expect(connectionGeometry(link, resolve)).toBeNull();
    expect(createConnectionGeometryResolver()(link, resolve)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  }
});

test('multipart viewport selection removes only off-screen paths and reuses stable selections', () => {
  const paths = [[[-10, 0], [10, 0]], [[-10, 5], [0, 0], [10, 5]], [[5, 5], [10, 10]]];
  const geometry = connectionGeometry({ coordinate_paths: paths }, () => null);
  const sourceCoordinates = geometry.coordinates;
  const select = createViewportGeometrySelector();
  const selected = select(geometry, view);
  expect(selected.coordinates).toEqual(paths.slice(0, 2));
  expect(selected.coordinates[0]).toBe(paths[0]);
  expect(selected.bounds).toEqual({ west: -10, east: 10, south: 0, north: 5 });
  expect(selected.pathBounds.length).toBe(8);
  expect(select(geometry, { ...view, west: -0.5 })).toBe(selected);
  expect(select(geometry, { west: -20, east: 20, south: -20, north: 20 })).toBe(geometry);
  expect(select(geometry, { west: 50, east: 60, south: 40, north: 50 })).toBeNull();
  expect(geometry.coordinates).toBe(sourceCoordinates);
  expect(geometry.coordinates).toEqual(paths);
  // A viewport inside the overall extent but between all its paths is empty.
  const separated = connectionGeometry({ coordinate_paths: [[[0, 0], [1, 1]], [[9, 9], [10, 10]]] }, () => null);
  expect(select(separated, { west: 4, east: 6, south: 4, north: 6 })).toBeNull();
});

test('multipart clipping handles wrapped/global views and keeps loaded single routes unchanged', () => {
  const geometry = connectionGeometry({ coordinate_paths: [[[-179, 0], [-175, 1]], [[150, 0], [155, 1]]] }, () => null);
  const select = createViewportGeometrySelector();
  expect(select(geometry, { west: 170, east: 190, south: -2, north: 2 }).coordinates).toEqual([geometry.coordinates[0]]);
  expect(select(geometry, { west: -190, east: -170, south: -2, north: 2 }).coordinates).toEqual([geometry.coordinates[0]]);
  expect(select(geometry, { west: -200, east: 200, south: -2, north: 2 })).toBe(geometry);
  const line = route([[-10, 0], [10, 0]]);
  expect(select(line, view)).toBe(line);
  expect(select(null, view)).toBeNull();
  expect(select(geometry, null)).toBe(geometry);
});

test('a wholly visible multipart extent skips per-branch scans at overview zooms', () => {
  const geometry = connectionGeometry({ coordinate_paths: [[[2, 48], [3, 49]], [[4, 50], [5, 51]]] }, () => null);
  const indexed = { ...geometry, pathBounds: new Proxy(geometry.pathBounds, {
    get: (target, name) => {
      if (/^\d+$/.test(String(name))) throw new Error('Overview must not scan path bounds');
      return Reflect.get(target, name, target);
    },
  }) };
  expect(createViewportGeometrySelector()(indexed, { west: -10, east: 20, south: 40, north: 60 })).toBe(indexed);
});

test('crossing routes remain visible even with neither endpoint in the viewport', () => {
  expect(geometryIntersectsViewport(route([[-10, 0], [10, 0]]), view)).toBe(true);
  expect(geometryIntersectsViewport(route([[-10, 5], [0, 0], [10, 5]]), view)).toBe(true);
  expect(geometryIntersectsViewport(route([[5, 5], [10, 10]]), view)).toBe(false);
});

test('full source routes are preserved and do not need node resolution', () => {
  const resolve = jest.fn();
  const points = [[2, 48], [3, 49], [4, 50]];
  expect(connectionGeometry({ coordinates: points }, resolve).coordinates).toEqual(points);
  expect(resolve).not.toHaveBeenCalled();
});

test('unchanged source routes share validated geometry across country, metadata and endpoint-map changes', () => {
  const resolve = createConnectionGeometryResolver();
  const source = Object.freeze([Object.freeze([2, 48]), Object.freeze([3, 49]), Object.freeze([4, 50])]);
  const endpoints = jest.fn();
  const first = resolve({ coordinates: source, id: 'a' }, endpoints);
  expect(resolve({ coordinates: source, id: 'renamed', s_nom: 800 }, jest.fn())).toBe(first);
  expect(first).toEqual(connectionGeometry({ coordinates: source }, endpoints));
  expect(first.coordinates).toBe(source);
  expect(endpoints).not.toHaveBeenCalled();
  const updated = resolve({ coordinates: [[2, 48], [3.5, 49], [4, 50]] }, endpoints);
  expect(updated).not.toBe(first);
  expect(updated.coordinates[1]).toEqual([3.5, 49]);
});

test('source sanitization is lazy, never mutates input, and keeps every valid route point', () => {
  const source = Object.freeze([
    Object.freeze([2, 48]), Object.freeze(['3', '49']), Object.freeze([null, 50]),
    Object.freeze([4, 50, 120]), Object.freeze([5, 51]), Object.freeze([200, 48]),
  ]);
  const resolved = connectionGeometry({ coordinates: source }, () => null);
  expect(resolved.coordinates).toEqual([[2, 48], [3, 49], [4, 50], [5, 51]]);
  expect(resolved.coordinates).not.toBe(source);
  expect(resolved.coordinates[0]).toBe(source[0]);
  expect(resolved.coordinates[3]).toBe(source[4]);
  expect(resolved.bounds).toEqual({ west: 2, south: 48, east: 5, north: 51 });
  expect(source[1]).toEqual(['3', '49']);
  expect(source[3]).toEqual([4, 50, 120]);
});

test('Leaflet can construct and edit a path without mutating reused frozen source coordinates', () => {
  const source = Object.freeze([Object.freeze([2, 48]), Object.freeze([3, 49]), Object.freeze([4, 50])]);
  const geometry = connectionGeometry({ coordinates: source }, () => null);
  const group = L.geoJSON({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: geometry.coordinates } });
  const path = group.getLayers()[0];
  expect(path.getLatLngs().map(point => [point.lng, point.lat])).toEqual(source);
  path.getLatLngs()[1].lng = 6;
  path.setLatLngs([[47, 1], [48, 2]]);
  expect(source).toEqual([[2, 48], [3, 49], [4, 50]]);
});

test('geometry and viewport validation match the former copying algorithm over mixed source routes', () => {
  const number = v => v == null || typeof v === 'boolean' || String(v).trim() === '' ? NaN : Number(v);
  let seed = 123;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const values = [null, false, '', ' ', NaN, Infinity, -200, 200, '-3', '48', 0, 1, 3, 40, 50];
  for (let pass = 0; pass < 150; pass += 1) {
    const input = Array.from({ length: pass % 30 }, () => [values[Math.floor(random() * values.length)], values[Math.floor(random() * values.length)]]);
    const expected = input.map(point => point.map(number)).filter(([lng, lat]) =>
      Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90);
    const distinct = expected.some(([lng, lat]) => lng !== expected[0][0] || lat !== expected[0][1]);
    const resolved = connectionGeometry({ coordinates: input }, () => null);
    if (expected.length < 2 || !distinct) expect(resolved).toBeNull();
    else {
      expect(resolved.coordinates).toEqual(expected);
      expect(resolved.bounds).toEqual({ west: Math.min(...expected.map(p => p[0])), east: Math.max(...expected.map(p => p[0])),
        south: Math.min(...expected.map(p => p[1])), north: Math.max(...expected.map(p => p[1])) });
    }
  }
});

test('geometry caching never retains stale resolved endpoints or substitutes coincident source routes', () => {
  const resolve = createConnectionGeometryResolver();
  const connection = { from: 'a', to: 'b', coordinates: [['invalid', 48]] };
  const nodes = { a: { latitude: 48, longitude: 2 }, b: { latitude: 49, longitude: 3 } };
  expect(resolve(connection, id => nodes[id]).coordinates[1]).toEqual([3, 49]);
  nodes.b = { latitude: 50, longitude: 4 };
  expect(resolve(connection, id => nodes[id]).coordinates[1]).toEqual([4, 50]);
  expect(resolve(connection, () => null)).toBeNull();
  const endpointLookup = jest.fn(id => nodes[id]);
  expect(resolve({ ...connection, coordinates: [[2, 48], [2, 48]] }, endpointLookup)).toBeNull();
  expect(endpointLookup).not.toHaveBeenCalled();
});

test('missing/blank coordinates never become fabricated zero coordinates; explicit numeric zero is valid', () => {
  for (const value of [null, undefined, '', ' ', false]) {
    expect(route([[value, 48], [3, 49]])).toBeNull();
    expect(connectionGeometry({ from: 'a', to: 'b' }, id => ({ latitude: 48, longitude: id === 'a' ? value : 3 }))).toBeNull();
  }
  expect(route([[0, 0], ['1', '1']]).coordinates).toEqual([[0, 0], [1, 1]]);
});

test('nodal lines use explicit endpoints; unknown endpoints never fabricate a route', () => {
  const nodes = { a: { latitude: 48, longitude: 2 }, b: { latitude: 49, longitude: 3 } };
  expect(connectionGeometry({ from: 'a', to: 'b' }, (id) => nodes[id]).coordinates).toEqual([[2, 48], [3, 49]]);
  expect(connectionGeometry({ from: 'a', to: 'missing' }, (id) => nodes[id])).toBeNull();
});

test('wrapped longitudes and global overviews retain the correct routes', () => {
  expect(geometryIntersectsViewport(route([[2, 48], [3, 49]]), { west: 360, east: 370, south: 40, north: 55 })).toBe(true);
  expect(geometryIntersectsViewport(route([[-179, 0], [-175, 1]]), { west: 170, east: 190, south: -2, north: 2 })).toBe(true);
  expect(geometryIntersectsViewport(route([[150, 0], [155, 1]]), { west: -200, east: 200, south: -2, north: 2 })).toBe(true);
});

test('screen-space route smoothing reduces overview drawing work without changing endpoints or source coordinates', () => {
  const points = Array.from({ length: 1001 }, (_, index) => L.point(index / 10, Math.sin(index / 10) * 0.3));
  const before = points.map(({ x, y }) => [x, y]);
  const tolerances = [4, 6, 8, 10].map(routeSmoothingForZoom);
  expect(tolerances).toEqual([2, 1.5, 1, 0.5]);
  for (const tolerance of tolerances) {
    const drawn = L.LineUtil.simplify(points, tolerance);
    expect(drawn.length).toBeLessThan(points.length / 10);
    expect(drawn[0]).toBe(points[0]);
    expect(drawn.at(-1)).toBe(points.at(-1));
  }
  expect(points.map(({ x, y }) => [x, y])).toEqual(before);
});
