import { networkFitPoints, countryFitFeatures } from './networkFitExtent';

const assets = Object.freeze([
  Object.freeze({ latitude: 48.85, longitude: 2.35 }),
  Object.freeze({ latitude: 50.85, longitude: 4.35 }),
  Object.freeze({ latitude: 40.42, longitude: -3.7 }),
  Object.freeze({ latitude: 4.92, longitude: -52.33 }),
  Object.freeze({ latitude: -20.9, longitude: 55.5 }),
  Object.freeze({ latitude: 28.1, longitude: -15.4 }),
]);

test('country framing uses owned polygons where national outlines are missing', () => {
  const polygon = code => ({ type: 'Feature', properties: { ISO2: code }, geometry: { type: 'Polygon', coordinates: [] } });
  const france = polygon('FR');
  const kosovo = polygon('XK');
  const unselected = polygon('RS');
  const redundant = polygon('FR');
  const point = { geometry: { type: 'Point', coordinates: [21, 42] } };
  const overlays = [
    { sourceCountryCode: 'XK', feature_collection: { features: [kosovo, point] } },
    { sourceCountryCode: 'FR', feature_collection: { features: [redundant] } },
    { sourceCountryCode: 'RS', feature_collection: { features: [unselected] } },
    { feature_collection: { features: [unselected] } },
  ];
  expect(countryFitFeatures(['FR', 'XK'], { features: [france] }, overlays)).toEqual([france, kosovo]);
  expect(countryFitFeatures(['XK'], null, overlays)).toEqual([kosovo]);
  expect(countryFitFeatures([], null, overlays)).toEqual([]);
});

test('European framing does not let overseas water assets force a world-scale view', () => {
  expect(networkFitPoints(assets, { preferEurope: true })).toEqual([[48.85, 2.35], [50.85, 4.35], [40.42, -3.7]]);
  expect(assets).toHaveLength(6); // Camera selection must not remove data.
});

test('explicit all-assets framing includes overseas assets and non-European-only data still fits', () => {
  expect(networkFitPoints(assets)).toHaveLength(6);
  expect(networkFitPoints(assets.slice(3), { preferEurope: true })).toEqual([[4.92, -52.33], [-20.9, 55.5], [28.1, -15.4]]);
});

test('missing coordinates cannot invent a distant 0,0 point but explicit numeric zero is valid', () => {
  for (const latitude of [null, undefined, false, '', ' ', NaN, 91]) {
    expect(networkFitPoints([{ latitude, longitude: 2 }])).toEqual([]);
  }
  expect(networkFitPoints([{ latitude: '0', longitude: 0 }])).toEqual([[0, 0]]);
  expect(networkFitPoints(null)).toEqual([]);
});
