import { buildResultsPreview, resultsTimestamp, formatResultsTick, resultsAxisTicks } from './resultsPreview';
const row = extra => ({ _date: '2026-01-01T00:00:00Z', value: 10, unit_name: 'MWh', ...extra });

test('source rows are preserved without summing, averaging, interpolation or deduplication', () => {
  const rows = [row({ child_name: 'A' }), row({ child_name: 'B' }), row({ value: 20, _date: '2026-01-02T00:00:00Z' })];
  const before = JSON.stringify(rows);
  const result = buildResultsPreview(rows);
  expect(result.groups[0].points.map(point => point.value)).toEqual([10, 10, 20]);
  expect(result.groups[0].points.slice(0, 2).map(point => point.dimensions[0].value)).toEqual(['A', 'B']);
  expect(result.observations).toBe(3); expect(result.skipped).toBe(0);
  expect(JSON.stringify(rows)).toBe(before);
});

test('incompatible units, missing units and clock bases are separate groups', () => {
  const result = buildResultsPreview([row({}), row({ unit_name: 'MW' }), row({ unit_name: '' }),
    row({ unit_name: null }), row({ _date: '2026-01-01 00:00:00' }), row({ unit_name: 'MWh', _date: '2026-01-01' })]);
  expect(result.groups).toHaveLength(4);
  expect(result.groups.find(group => group.unit === '').points).toHaveLength(2);
  expect(result.groups.find(group => group.clock === 'source').points).toHaveLength(2);
  expect(result.groups.find(group => group.unit === 'MW').points[0].value).toBe(10);
  expect(result.observations).toBe(6);
});

test.each([null, undefined, '', ' ', false, true, [], {}, Infinity, -Infinity, NaN, 'Infinity', 'NaN', '0x10'])('invalid value %j is excluded, not converted to zero', value => {
  const result = buildResultsPreview([row({ value })]);
  expect(result.observations).toBe(0); expect(result.excluded.value).toBe(1);
});

test.each([0, -12.5, '0', ' -12.5 ', '1e3', '.5'])('finite decimal %j remains a source value', value => {
  expect(buildResultsPreview([row({ value })]).groups[0].points[0].value).toBe(Number(value));
});

test.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '2026-01-00',
  '2026-01-01T24:00:00Z', '2026-01-01T12:60:00Z', '2026-01-01T12:00:60Z',
  '2026-01-01T12:00:00+25:00', '0000-01-01', '01/02/2026', '', null, 1767225600000])('unsupported or invalid date %j does not roll over silently', value => {
  expect(resultsTimestamp(value)).toBe(null);
  expect(buildResultsPreview([row({ _date: value })]).excluded.date).toBe(1);
});

test('calendar-valid leap days and offset instants are parsed independently of browser timezone', () => {
  expect(resultsTimestamp('2024-02-29').time).toBe(Date.UTC(2024, 1, 29));
  const qualified = resultsTimestamp('2026-01-01T00:30:00+01:00');
  expect(qualified).toMatchObject({ time: Date.UTC(2025, 11, 31, 23, 30), clock: 'utc', sourceDate: '2026-01-01T00:30:00+01:00' });
  expect(resultsTimestamp('2026-01-01 00:30:00')).toMatchObject({ time: Date.UTC(2026, 0, 1, 0, 30), clock: 'source' });
  expect(formatResultsTick(qualified.time)).toBe('2025-12-31');
  expect(formatResultsTick(qualified.time, 'month')).toBe('2025-12');
  expect(formatResultsTick(qualified.time, 'year')).toBe('2025');
});

test('filters are applied before invalid-row counts and do not alter source metadata', () => {
  const result = buildResultsPreview([row({ category_name: 'Supply', value: null }),
    row({ category_name: 'Demand', property_name: 'Energy', child_name: '<script>literal</script>' }),
    row({ category_name: 'Demand', unit_name: {} })], { category_name: 'Demand' });
  expect(result.excluded).toEqual({ filters: 1, value: 0, date: 0, unit: 1 });
  expect(result.groups[0].points[0].dimensions).toContainEqual({ field: 'property_name', value: 'Energy' });
  expect(result.observations).toBe(1);
});

test('chronology is sorted while the original timestamp and source order of coincident points remain intact', () => {
  const result = buildResultsPreview([row({ _date: '2026-02-01T00:00:00Z', value: 30 }), row({ value: 10 }), row({ value: 20 })]);
  expect(result.groups[0].points.map(point => point.value)).toEqual([10, 20, 30]);
  expect(formatResultsTick(Infinity)).toBe('');
});

test('axis ticks are unique, chronological and evenly sampled without removing observations', () => {
  const points = [0, 0, 10, 20, 30, 40, 50, 60].map(time => ({ time }));
  expect(resultsAxisTicks(points, 4)).toEqual([0, 20, 40, 60]);
  expect(resultsAxisTicks([{ time: 10 }, { time: 10 }])).toEqual([10]);
  expect(resultsAxisTicks([{ time: NaN }, {}, null])).toEqual([]);
  expect(points).toHaveLength(8);
});
