import { generatorInstalledCapacity } from './modelInstalledCapacity';
const capacity = { status: 'resolved', value: 1, unit: 'MW', provenance: { filename: 'capacity.csv' } };
const units = { status: 'resolved', value: 150.03, unit: '-' };
test('installed capacity retains both inputs, fractional unit counts and linked-file evidence', () => {
  expect(generatorInstalledCapacity(capacity, units)).toMatchObject({ value: 150.03, status: 'resolved',
    capacity_per_unit: capacity, unit_count: units, derivation: 'Units × Max Capacity', provenance: capacity.provenance });
});
test('a disabled generator is a real zero, not its unused per-unit rating', () => {
  expect(generatorInstalledCapacity(capacity, { ...units, value: 0 }).value).toBe(0);
});
test.each([undefined, { ...units, value: null }, { ...units, value: -1 }, { ...units, status: 'unresolved' },
  { ...units, unit: 'MW' }, { ...units, value: '1' }])('unresolved unit count %p cannot fabricate installed capacity', input => {
  expect(generatorInstalledCapacity(capacity, input)).toMatchObject({ status: 'unresolved', value: null });
});
