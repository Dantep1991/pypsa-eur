import { regionBoundaryCollection, nodeHoverText } from './regionBoundaries';
const polygon = code => ({ type: 'Feature', properties: { ISO2: code }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } });
test('combines exact member polygons without adding neighbouring countries', () => {
  const data = { features: [polygon('ES'), polygon('PT'), polygon('FR')] };
  const result = regionBoundaryCollection(data, [{ name: 'Iberia', countryCodes: ['ES', 'PT'] }]);
  expect(result.features).toHaveLength(1);
  expect(result.features[0].geometry.coordinates).toHaveLength(2);
  expect(result.features[0].properties.countries).toBe('ES, PT');
  expect(data.features).toHaveLength(3);
});
test('does not misrepresent incomplete region geometry', () => {
  expect(regionBoundaryCollection({ features: [polygon('ES')] }, [{ name: 'Iberia', countryCodes: ['ES', 'PT'] }]).features).toEqual([]);
});
test('node descriptions include identity, country and component', () => {
  expect(nodeHoverText({ name: 'Madrid', country: 'ES', component_type: 'Bus', carrier: 'AC' })).toBe('Madrid · Bus · ES · AC');
  expect(nodeHoverText({ atlas_region_group_name: 'Iberia', country_codes: ['ES', 'PT'] })).toContain('Countries: ES, PT');
});
