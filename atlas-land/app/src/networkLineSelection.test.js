import { createNetworkLinePicker } from './networkLineSelection';

const map = {
  latLngToContainerPoint: ([lat, lng]) => ({ x: lng * 10, y: -lat * 10 }),
  containerPointToLatLng: ([x, y]) => ({ lat: -y / 10, lng: x / 10 }),
};
const feature = (id, coordinates, type = 'LineString') => ({ geometry: { type, coordinates }, properties: { connection: { id } } });
const collection = features => ({ type: 'FeatureCollection', features });

test('thin lines remain selectable within ten screen pixels, but background does not select them', () => {
  const pick = createNetworkLinePicker(collection([feature('line', [[0, 0], [10, 0]])]));
  expect(pick({ x: 50, y: 9 }, map)).toEqual({ id: 'line' });
  expect(pick({ x: 50, y: 11 }, map)).toBeNull();
  expect(pick({ x: 109, y: 0 }, map)).toEqual({ id: 'line' });
  expect(pick({ x: 111, y: 0 }, map)).toBeNull();
});
test('picks the nearest actual path, including multipart routes, not an inferred chord', () => {
  const pick = createNetworkLinePicker(collection([
    feature('straight', [[0, 0], [10, 0]]),
    feature('routed', [[[0, 2], [5, 4], [10, 2]], [[20, 2], [25, 2]]], 'MultiLineString'),
  ]));
  expect(pick({ x: 50, y: -40 }, map)).toEqual({ id: 'routed' });
  expect(pick({ x: 230, y: -20 }, map)).toEqual({ id: 'routed' });
  expect(pick({ x: 150, y: -20 }, map)).toBeNull();
  expect(pick({ x: 50, y: -4 }, map)).toEqual({ id: 'straight' });
});
test('missing, invalid or stale geometry does not manufacture a selectable route', () => {
  const pick = createNetworkLinePicker(collection([feature('broken', [[0, 0], null, [10, 0]]), feature('missing', [])]));
  expect(pick({ x: 50, y: 0 }, map)).toBeNull();
  expect(createNetworkLinePicker(null)({ x: 50, y: 0 }, map)).toBeNull();
  expect(createNetworkLinePicker(collection([feature('new', [[0, 3], [10, 3]])]))({ x: 50, y: 0 }, map)).toBeNull();
});
