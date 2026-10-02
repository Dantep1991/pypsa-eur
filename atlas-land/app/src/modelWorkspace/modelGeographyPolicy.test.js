import { assertModelGeographyOperation, modelGeographyPolicy, resolveModelCountryScope } from './modelGeographyPolicy';

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
  expect(modelGeographyPolicy({ mode: 'reference' })).toBeNull();
  expect(assertModelGeographyOperation(null, 'add-country-network')).toBe(true);
});

test('missing metadata or a stale mode flag never bypass project geography guards', () => {
  const policy = modelGeographyPolicy({ mode: 'reference', projectId: 'DHEM_2026' });
  expect(policy.canAddCountryNetworks).toBe(false);
  expect(policy.nativeGeography).toBe('model-native geography');
  expect(() => assertModelGeographyOperation(policy, 'change-resolution')).toThrow(/cannot.*split/i);
});

test('model country requests select only existing project countries', () => {
  const available = ['FR', 'IE', 'IT'];
  expect(resolveModelCountryScope(available, ['IT'], ['FR', 'IE'])).toEqual(['FR', 'IE']);
  expect(resolveModelCountryScope(available, ['IT'], ['FR'], 'add')).toEqual(['FR', 'IT']);
  expect(resolveModelCountryScope(available, ['FR', 'IE'], ['FR'], 'remove')).toEqual(['IE']);
  expect(resolveModelCountryScope(available, ['FR', 'IE'], ['IT'], 'add')).toEqual([]);
  expect(() => resolveModelCountryScope(available, [], ['BE'])).toThrow('BE is not in this project model');
  expect(() => resolveModelCountryScope(available, ['FR'], ['FR'], 'remove')).toThrow(/empty model view/);
});
