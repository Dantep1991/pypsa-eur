import { isDisabledConnection, operationalConnectionStyle, visibleOperationalConnections } from './connectionVisibility';

const lines = [
  { id: 'outage', operational_state: { status: 'disabled' } },
  { id: 'active', operational_state: { status: 'active' } },
  { id: 'unknown', operational_state: { status: 'unknown' }, dash_array: '2 5' },
  { id: 'border', is_cross_border: true, dash_array: '6 5' },
];

test('disabled links default to visible; hiding changes only the view', () => {
  expect(visibleOperationalConnections(lines)).toBe(lines);
  expect(visibleOperationalConnections(lines, false).map(row => row.id)).toEqual(['active', 'unknown', 'border']);
  expect(lines).toHaveLength(4);
  expect(lines[0].operational_state.status).toBe('disabled');
  expect(visibleOperationalConnections(lines, true)).toBe(lines);
});
test('dashes and unknown states do not imply a disabled connection', () => {
  expect(lines.map(isDisabledConnection)).toEqual([true, false, false, false]);
});
test('base disabled lines use the theme colour even without a scenario preview', () => {
  const palette = { disabled: 'theme-failure-colour' };
  expect(operationalConnectionStyle(lines[0], palette)).toMatchObject({ color: palette.disabled, weight: 3.5 });
  expect(operationalConnectionStyle(lines[1], palette)).toBeNull();
  expect(operationalConnectionStyle({ ...lines[0], atlas_result_color: 'result-colour' }, palette).color).toBe(palette.disabled);
});
