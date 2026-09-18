import { createSpatialFeatureKey } from './spatialFeatureKey';

const feature = (id, coordinates, properties = {}) => ({ id, geometry: { type: 'LineString', coordinates }, properties });
const collection = features => ({ features });

test('cold and warm keys never serialize long route vertices', () => {
  const key = createSpatialFeatureKey();
  const coordinates = Array.from({ length: 10000 }, (_, index) => [index / 1000, 50 + index / 10000]);
  const stringify = jest.spyOn(JSON, 'stringify');
  try {
    const original = key('z4', collection([feature('route', coordinates)]));
    for (let index = 0; index < 50; index += 1) {
      key(`z${index}`, collection([feature('route', coordinates, { style: { opacity: index / 50 } })]));
    }
    expect(stringify).not.toHaveBeenCalled();
    expect(key('z4', collection([feature('route', coordinates)]))).toBe(original);
    expect(stringify).not.toHaveBeenCalled();
  } finally { stringify.mockRestore(); }
});

test('replacing an immutable long route invalidates it even when count/endpoints are unchanged', () => {
  const key = createSpatialFeatureKey();
  const source = [[1, 48], [2, 49], [3, 50]];
  const original = key('route', collection([feature('a', source)]));
  expect(key('route', collection([feature('a', source)]))).toBe(original);
  expect(key('route', collection([feature('a', [[1, 48], [2.5, 49], [3, 50]])]))).not.toBe(original);
  expect(key('route', collection([feature('a', source.map(p => [...p]))]))).not.toBe(original);
});

test('equal-count geometry, order and style replacements still change the layer key', () => {
  const key = createSpatialFeatureKey();
  const a = feature('a', [[1, 50], [2, 51]]);
  const b = feature('b', [[3, 52], [4, 53]]);
  const original = key('lines', collection([a, b]));
  const replacements = [
    [b, a], [a, feature('b', [[3, 52], [4.1, 53]])],
    [a, { ...b, properties: { style: { dashArray: '4 4' } } }],
    [a, { ...b, properties: { style: { opacity: 0 } } }],
    [a, { ...b, properties: { capacity: { value: 1000 } } }],
  ];
  for (const features of replacements) expect(key('lines', collection(features))).not.toBe(original);
  expect(key('lines', collection([feature('a', [[1, 50], [2, 51]]), b]))).toBe(original);
});

test('source/popup replacement and selection update points without requiring coordinate changes', () => {
  const key = createSpatialFeatureKey();
  const coordinates = [2, 50];
  const facility = { name: 'Old source' };
  const point = { id: 'a', geometry: { type: 'Point', coordinates }, properties: { facility } };
  const original = key('points', collection([point]));
  expect(key('points', collection([{ ...point, properties: { facility, isSelected: true } }]))).not.toBe(original);
  expect(key('points', collection([{ ...point, properties: { facility: { name: 'Updated source' } } }]))).not.toBe(original);
  expect(key('points', collection([point]))).toBe(original);
});

test('node layers can update selection in place while source and geometry changes still replace the layer', () => {
  const key = createSpatialFeatureKey();
  const facility = { id: 'a' };
  const point = { id: 'a', geometry: { type: 'Point', coordinates: [2, 50] }, properties: { facility } };
  const selected = { ...point, properties: { facility, isSelected: true } };
  const original = key('nodes', collection([point]), { ignoreSelection: true });
  expect(key('nodes', collection([selected]), { ignoreSelection: true })).toBe(original);
  expect(key('nodes', collection([{ ...selected, properties: { facility: { id: 'new-source' } } }]), { ignoreSelection: true })).not.toBe(original);
  expect(key('nodes', collection([{ ...selected, geometry: { type: 'Point', coordinates: [3, 50] } }]), { ignoreSelection: true })).not.toBe(original);
});

test('generation composition and marker styling update even with identical totals, counts and endpoints', () => {
  const key = createSpatialFeatureKey();
  const point = { id: 'same-bus', geometry: { type: 'Point', coordinates: [2, 50] },
    properties: { facility: { id: 'bus' }, total: 100, capacityTotal: 100,
      segments: [{ carrier: 'wind', value: 60 }, { carrier: 'solar', value: 40 }] } };
  const original = key('mix', collection([point]));
  expect(key('mix', collection([{ ...point, properties: { ...point.properties,
    segments: [{ carrier: 'wind', value: 40 }, { carrier: 'solar', value: 60 }],
  } }]))).not.toBe(original);
  for (const change of [{ color: 'red' }, { nodeEmphasis: 2 }, { demandSizeRatio: 0.7 }, { shape: 'triangle' }]) {
    expect(key('mix', collection([{ ...point, properties: { ...point.properties, ...change } }]))).not.toBe(original);
  }
});
