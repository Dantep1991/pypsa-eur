import { connectionCapacityScales, getConnectionCapacity } from './connectionCapacity';

test('AC MVA, DC MW and reported infrastructure units are never pooled', () => {
  const scales = connectionCapacityScales([
    { s_nom: 500 }, { s_nom: 2000 }, { p_nom: 20 }, { p_nom: 80 },
    { s_nom: 3000, capacity_units: 'tonnes/year' }, { capacity_gwh_d: 10 },
  ]);
  expect(scales.map(scale => [scale.units, scale.count])).toEqual([['MVA', 2], ['MW', 2], ['tonnes/year', 1], ['GWh/d', 1]]);
  expect(getConnectionCapacity({ s_nom: 3000, capacity_units: 'tonnes/year' })).toMatchObject({ units: 'tonnes/year', kind: 'Reported capacity', value: 3000 });
});

test('legend values correspond exactly to the logarithmic colour positions', () => {
  const [scale] = connectionCapacityScales(Array.from({ length: 100 }, (_, index) => ({ s_nom: index < 70 ? 503 : 1787 })));
  expect(scale.low).toBe(503);
  expect(scale.high).toBe(1787);
  expect(scale.mid).toBeGreaterThan(503);
  expect(scale.normalize(scale.low)).toBeCloseTo(0);
  expect(scale.normalize(scale.mid)).toBeCloseTo(0.5);
  expect(scale.normalize(scale.high)).toBeCloseTo(1);
  expect(scale.normalize(10)).toBe(0);
  expect(scale.normalize(9000)).toBe(1);
});

test('uniform data uses one colour; collapsed percentiles retain genuine outliers', () => {
  const [uniform] = connectionCapacityScales([{ p_nom: 100 }, { p_nom: 100 }]);
  expect(uniform).toMatchObject({ low: 100, high: 100, uniform: true });
  expect(uniform.normalize(100)).toBe(0.5);
  const [outliers] = connectionCapacityScales([...Array.from({ length: 100 }, () => ({ p_nom: 100 })), { p_nom: 200 }]);
  expect(outliers).toMatchObject({ low: 100, high: 200, uniform: false, rangeLabel: 'reported range' });
});

test('zero availability is a published limit, not missing information', () => {
  expect(getConnectionCapacity({ s_nom: 1000, s_max_pu: 0 })).toMatchObject({ value: 1000, available: 0, securityFactor: 0 });
  expect(getConnectionCapacity({ p_nom: 800, p_max_pu: '0' })).toMatchObject({ value: 800, available: 0, units: 'MW' });
  for (const s_max_pu of [null, undefined, '', ' ', false, 'unknown', -1]) {
    expect(getConnectionCapacity({ s_nom: 1000, s_max_pu }).available).toBeNull();
  }
});

test('only positive rated capacities participate; source records are unchanged', () => {
  const records = [{ s_nom: 1000, s_nom_opt: 1500 }, { s_nom: 500, s_nom_opt: 0 }, { s_nom: null }, { s_nom: -1 }, { p_nom: 0 }];
  const original = JSON.stringify(records);
  expect(connectionCapacityScales(records)[0].count).toBe(2);
  expect(getConnectionCapacity(records[0])).toMatchObject({ value: 1500, kind: 'Optimised rating' });
  expect(getConnectionCapacity(records[1])).toMatchObject({ value: 500, kind: 'Nominal rating' });
  expect(JSON.stringify(records)).toBe(original);
});
