import { modelCountryProjection } from './modelCountryProjection';
const scene = { meta: { countries: ['FR', 'ES', 'BE'], aggregationCatalog: {
  native_resolution: 'ehighway', regional_registry: { schemes: [{ regions: [{}] }] },
} } };
test('Spain at bidding zone preserves France at native, then removing scope does not reset tiers', () => {
  const result = modelCountryProjection(scene, null, ['ES'], { resolution: 'bidding_zone' });
  expect(result.resolution).toBe('mixed');
  expect(result.options.resolutionByCountry).toEqual({ FR: 'native', ES: 'bidding_zone', BE: 'native' });
  const previous = { aggregation: { level: result.resolution, options: result.options } };
  expect(modelCountryProjection(scene, previous, ['FR'], {}).options.resolutionByCountry).toEqual(result.options.resolutionByCountry);
});
test.each(['bidding_zone', 'country', 'regional'])('native model can aggregate to %s', resolution => {
  expect(modelCountryProjection(scene, null, scene.meta.countries, { resolution }).resolution).toBe(resolution);
});
test('explicit overrides and native alias are validated against actual catalogue', () => {
  expect(modelCountryProjection(scene, null, ['ES'], { resolution: 'ehighway', otherResolution: 'country' })
    .options.resolutionByCountry).toEqual({ ES: 'native', FR: 'country', BE: 'country' });
  expect(() => modelCountryProjection(scene, null, ['ES'], { resolution: 'nuts3' })).toThrow(/unavailable finer/);
  expect(() => modelCountryProjection(scene, null, ['ES'], { resolutionsByCountry: { XX: 'country' } })).toThrow(/not in/);
});
