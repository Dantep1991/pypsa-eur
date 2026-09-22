import { assertModelGeographyOperation, modelGeographyPolicy } from './modelGeographyPolicy';

test('a bound model exposes its source countries without treating them as loadable networks', () => {
  const policy = modelGeographyPolicy({
    mode: 'model',
    projectId: 'TYNDP_2026_Scenarios',
    projectName: 'TYNDP 2026 Scenarios',
    version: 'v3.0.0',
    nativeGeography: { label: 'Bidding zones' },
  }, { countries: ['ES', 'FR', 'ES'], version: 'v3.0.0' });

  expect(policy.projectName).toBe('TYNDP 2026 Scenarios');
  expect(policy.sourceCountries).toEqual(['ES', 'FR']);
  expect(policy.canAddCountryNetworks).toBe(false);
  expect(policy.canIncreaseResolution).toBe(false);
  expect(policy.message).toMatch(/cannot add a separate full-granularity country network/i);
});

test.each([
  'add-country-network',
  'select-all-country-networks',
  'change-resolution',
  'mixed-resolution',
])('a bound model rejects synthetic geography operation %s', (operation) => {
  const policy = modelGeographyPolicy({ mode: 'model', projectId: 'TYNDP', nativeGeography: { label: 'Bidding zones' } });
  expect(() => assertModelGeographyOperation(policy, operation)).toThrow(/cannot add.*full-granularity|cannot.*split/i);
});

test('standalone Atlas retains country network controls', () => {
  expect(modelGeographyPolicy({ mode: 'reference', projectId: 'atlas' })).toBeNull();
  expect(assertModelGeographyOperation(null, 'add-country-network')).toBe(true);
});
