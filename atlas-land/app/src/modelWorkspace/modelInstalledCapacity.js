// PLEXOS Generator nameplate capacity is Units × Max Capacity. Keep both
// resolved inputs as evidence; missing unit counts are not an implicit one.
export function generatorInstalledCapacity(capacity, units) {
  const resolved = input => input?.status === 'resolved' && typeof input.value === 'number'
    && Number.isFinite(input.value) && input.value >= 0;
  const evidence = { capacity_per_unit: capacity, unit_count: units, derivation: 'Units × Max Capacity' };
  if (!resolved(capacity) || capacity.unit !== 'MW') return { ...capacity, ...evidence,
    status: 'unresolved', value: null, note: capacity?.note || 'Per-unit capacity is not resolved in MW.' };
  if (!resolved(units) || !['-', 'unit', 'units', ''].includes(units.unit || '')) return { ...capacity, ...evidence,
    status: 'unresolved', value: null, note: units?.note || 'Generator unit count is not resolved.' };
  const value = capacity.value * units.value;
  return Number.isFinite(value) ? { ...capacity, ...evidence, status: 'resolved', value, note: '' }
    : { ...capacity, ...evidence, status: 'unresolved', value: null, note: 'Installed capacity is outside the numeric range.' };
}
