import { regionBoundaryCollection, regionBoundaryTooltip, nodeHoverText } from './regionBoundaries';
const polygon = code => ({ type: 'Feature', properties: { ISO2: code }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } });
test('combines exact member polygons without adding neighbouring countries', () => {
  const data = { features: [polygon('ES'), polygon('PT'), polygon('FR')] };
  const result = regionBoundaryCollection(data, [{ name: 'Iberia', countryCodes: ['ES', 'PT'] }]);
  expect(result.features).toHaveLength(1);
  expect(result.features[0].geometry.coordinates).toHaveLength(2);
  expect(result.features[0].properties.countries).toBe('ES, PT');
  expect(data.features).toHaveLength(3);
});
test('shows available outlines while explicitly identifying incomplete region geometry', () => {
  const result = regionBoundaryCollection({ features: [polygon('ES')] }, [{ name: 'Iberia', countryCodes: ['ES', 'PT'] }]);
  expect(result.features).toHaveLength(1);
  expect(result.features[0].properties).toMatchObject({ boundaryComplete: false, shownCountries: ['ES'], missingCountries: ['PT'] });
  expect(result.incomplete).toEqual([{ name: 'Iberia', shownCountries: ['ES'], missingCountries: ['PT'], total: 2 }]);
  expect(regionBoundaryTooltip(result.features[0])).toContain('Outlines shown: 1/2 · Missing outline: PT');
});
test('missing or non-polygon geometry never fabricates an outline', () => {
  const result = regionBoundaryCollection({ features: [
    { type: 'Feature', properties: { ISO2: 'ES' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    { ...polygon('PT'), geometry: { type: 'Polygon', coordinates: [] } },
  ] }, [{ name: 'Iberia', countryCodes: ['ES', 'PT', 'PT'] }]);
  expect(result.features).toEqual([]);
  expect(result.incomplete[0]).toMatchObject({ shownCountries: [], missingCountries: ['ES', 'PT'], total: 2 });
});
test('a missing member does not suppress other selected groups or shift their colours', () => {
  const regions = [{ name: 'Unmapped', countryCodes: ['XX'] }, { name: 'Known', countryCodes: ['ES', 'PT'] }];
  const result = regionBoundaryCollection({ features: [polygon('ES'), polygon('PT')] }, regions);
  expect(result.features).toHaveLength(1);
  expect(result.features[0].properties).toMatchObject({ name: 'Known', color: '#7c3aed', boundaryComplete: true });
  expect(regionBoundaryTooltip(result.features[0])).toBe('Known · Countries: ES, PT');
});
test('actual Baltic and CESEC memberships draw from the release asset even without Kosovo', () => {
  const data = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../public/europe.geojson'), 'utf8'));
  const regions = [
    { id: 'ec-bemip', name: 'Baltic', countryCodes: ['DK', 'DE', 'EE', 'LV', 'LT', 'PL', 'FI', 'SE'] },
    { id: 'ec-cesec', name: 'Central and South-East', countryCodes: ['AT', 'BG', 'HR', 'GR', 'HU', 'RO', 'SK', 'SI', 'AL', 'BA', 'XK', 'ME', 'MK', 'RS', 'UA'] },
  ];
  const result = regionBoundaryCollection(data, regions);
  expect(result.features).toHaveLength(2);
  expect(result.features[0].properties.boundaryComplete).toBe(true);
  expect(result.features[1].properties.shownCountries).toHaveLength(14);
  expect(result.features[1].properties.missingCountries).toEqual(['XK']);
  expect(result.incomplete).toHaveLength(1);
  expect(data.features.some(feature => feature.properties.ISO2 === 'XK')).toBe(false);
});
test('node descriptions include identity, country and component', () => {
  expect(nodeHoverText({ name: 'Madrid', country: 'ES', component_type: 'Bus', carrier: 'AC' })).toBe('Madrid · Bus · ES · AC');
  expect(nodeHoverText({ atlas_region_group_name: 'Iberia', country_codes: ['ES', 'PT'] })).toContain('Countries: ES, PT');
});
