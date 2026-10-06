import { parseInputEquation, evaluateInputEquation } from './inputEquation';

const objects = [{ id: 'a' }, { id: 'b' }];
const data = new Map([
  ['Capacity', new Map([['a', { value: 400, unit: 'MW' }], ['b', { value: 100, unit: 'MW' }]])],
  ['Count', new Map([['a', { value: 2, unit: '-' }], ['b', { value: 3, unit: '-' }]])],
]);
const calculate = (expression, values = data, selection = objects) => evaluateInputEquation(parseInputEquation(expression, [...values.keys()]), selection, values);

test.each([
  ['[Capacity] / 2', 200, 'MW'], ['[Capacity] * [Count]', 800, 'MW'],
  ['[Capacity] + 10', 410, 'MW'], ['[Capacity] - 10', 390, 'MW'],
  ['([Capacity] + 10) / (2 + 3)', 82, 'MW'], ['-[Capacity]', -400, 'MW'],
  ['[Capacity] * 10%', 40, 'MW'], ['[Capacity] / [Capacity]', 1, ''],
  ['1e2 + .5 * 2', 101, ''], ['percent([Capacity])', 80, '%'],
  ['total([Capacity])', 500, 'MW'], ['100 * [Capacity] / total([Capacity])', 80, ''],
])('%s uses safe precedence and units', (expression, value, unit) => {
  expect(calculate(expression).get('a')).toMatchObject({ value, unit, status: 'resolved', equation: expression });
});

test('percent denominator is each selected object once, not each map placement', () => {
  const manyPlacements = [{ id: 'a', nodes: [{ id: 'x' }, { id: 'y' }] }, { id: 'b', nodes: [] }];
  const values = calculate('percent([Capacity])', data, manyPlacements);
  expect(values.get('a').value).toBe(80); expect(values.get('b').value).toBe(20);
  expect(calculate('percent([Capacity])', data, objects.slice(0, 1)).get('a').value).toBe(100);
});

test('unresolved totals remain unknown for every object; no zero-filling or partial shares', () => {
  const missing = new Map([['Capacity', new Map([['a', { value: 400, unit: 'MW' }], ['b', { value: null, note: 'No matching linked-file row' }]])]]);
  const values = calculate('percent([Capacity])', missing);
  for (const measurement of values.values()) {
    expect(measurement.value).toBeNull(); expect(measurement.note).toContain('Total unavailable');
  }
  const simple = calculate('[Capacity] * 2', missing);
  expect(simple.get('a').value).toBe(800); expect(simple.get('b').value).toBeNull();
});

test('zero totals and division by zero never create infinity or a fabricated zero', () => {
  const zero = new Map([['Capacity', new Map(objects.map(obj => [obj.id, { value: 0, unit: 'MW' }]))]]);
  expect(calculate('percent([Capacity])', zero).get('a')).toMatchObject({ value: null, note: expect.stringContaining('total is zero') });
  expect(calculate('[Capacity] / 0').get('a')).toMatchObject({ value: null, note: 'Division by zero.' });
});

test('units are validated, not silently converted or dropped', () => {
  const mixed = new Map([...data, ['Cost', new Map(objects.map(obj => [obj.id, { value: 4, unit: 'EUR' }]))]]);
  mixed.set('Capacity', new Map(data.get('Capacity')));
  expect(calculate('[Capacity] + [Cost]', mixed).get('a').value).toBeNull();
  expect(calculate('[Capacity] + [Count]').get('a').value).toBeNull();
  expect(calculate('[Capacity] / [Cost]', mixed).get('a').unit).toBe('EUR^-1 · MW');
  mixed.get('Capacity').set('b', { value: 1, unit: 'GW' });
  expect(calculate('percent([Capacity])', mixed).get('a').note).toContain('incompatible units');
});

test('formula measurements preserve operand values and provenance for the tooltip', () => {
  expect(calculate('[Capacity] * [Count]').get('a').operands).toEqual([
    { property: 'Capacity', value: 400, unit: 'MW' }, { property: 'Count', value: 2, unit: '-' },
  ]);
});

test.each(['', '[Missing] + 1', '[Capacity]', 'window.alert(1)', '1; alert(1)', '2 ** 3',
  'Math.max(1, 2)', '1 +', '(1 + 2', '1 2', '__proto__', '1e999'])('rejects invalid/unknown/executable syntax: %s', expression => {
  const available = expression === '[Capacity]' ? [] : [...data.keys()];
  expect(() => parseInputEquation(expression, available)).toThrow();
});

test('limits nesting and expression length', () => {
  expect(() => parseInputEquation('('.repeat(33) + '1' + ')'.repeat(33), [])).toThrow(/nested/);
  expect(() => parseInputEquation('-'.repeat(40) + '1', [])).toThrow(/nested/);
  expect(() => parseInputEquation('1'.repeat(2001), [])).toThrow(/2,000/);
});

test('nested totals are visibly refused', () => {
  expect(calculate('total(percent([Capacity]))').get('a').note).toContain('cannot contain another total');
});
