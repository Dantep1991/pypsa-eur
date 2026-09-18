import { atlasAssetUrl } from './assets';

test.each([
  ['', 'europe.geojson', '/europe.geojson'],
  ['/atlas/', '/europe.geojson', '/atlas/europe.geojson'],
  ['/products/flow', 'nodal_coordinates.csv', '/products/flow/nodal_coordinates.csv'],
  ['https://assets.nohm.example/atlas/', 'europe.geojson', 'https://assets.nohm.example/atlas/europe.geojson'],
  ['.', 'europe.geojson', './europe.geojson'],
])('resolves public data against the configured asset base %s', (base, file, expected) => {
  expect(atlasAssetUrl(file, base)).toBe(expected);
});
