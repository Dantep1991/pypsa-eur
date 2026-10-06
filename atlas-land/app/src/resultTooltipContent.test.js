import { hasResultValue, resultTooltipContent } from './resultTooltipContent';

const record = { id: 'Node:A', name: 'Zone A', atlas_result_label: 'Price', atlas_result_unit: '$/MWh', atlas_result_period: 'Annual 2050' };
const content = data => { const root = document.createElement('div'); root.innerHTML = resultTooltipContent(data); return root; };

test.each([0, -2.1, 42.1234, 0.0000007])('tooltip retains finite result %s with units and period', value => {
  const node = { ...record, atlas_result_value: value };
  expect(hasResultValue(node)).toBe(true);
  const root = content(node);
  expect(root.textContent).toContain(new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value));
  expect(root.textContent).toContain('Price:');
  expect(root.textContent).toContain('$/MWh');
  expect(root.textContent).toContain('Annual 2050');
});

test('visual aggregate names cannot replace the actual quantity tooltip', () => {
  const root = content({ ...record, atlas_region_group_name: 'Regional group', country_codes: ['AA', 'BB'], atlas_result_value: 12 });
  expect(root.textContent).toContain('Regional group');
  expect(root.textContent).toContain('Price: 12 $/MWh');
});

test('comparison bubbles show baseline, candidate and signed change in one tooltip', () => {
  const root = content({ ...record, atlas_result_label: 'Δ Price', atlas_result_value: -5,
    atlas_result_baseline_value: 20, atlas_result_candidate_value: 15 });
  ['Baseline: 20', 'Candidate: 15', 'Δ Price: -5'].forEach(value => expect(root.textContent).toContain(value));
});

test('names, property labels, units and periods are escaped, missing results are not shown as zero', () => {
  const injection = '<img src=x onerror=alert(1)>';
  const root = content({ ...record, name: injection, atlas_result_label: injection,
    atlas_result_unit: injection, atlas_result_period: injection, atlas_result_value: 0 });
  expect(root.querySelector('img')).toBeNull();
  expect(root.textContent).toContain(injection);
  [null, undefined, NaN, Infinity].forEach(value => {
    expect(hasResultValue({ ...record, atlas_result_value: value })).toBe(false);
    expect(content({ ...record, atlas_result_value: value }).textContent).not.toContain('Price:');
  });
});
