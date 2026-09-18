import React from 'react';
import { render } from '@testing-library/react';
import GridAccessLegend from './GridAccessLegend';

test.each([
  ['pressure', 'Lower pressure', 'Higher pressure', 'rgb(34, 197, 94)'],
  ['available_mw', 'Less access (MW)', 'More access (MW)', 'rgb(239, 68, 68)'],
  ['queued_mw', 'Less queued (MW)', 'More queued (MW)', 'rgb(34, 197, 94)'],
  ['project_count', 'Fewer projects', 'More projects', 'rgb(34, 197, 94)'],
  ['lead_time_years', 'Shorter lead time', 'Longer lead time', 'rgb(34, 197, 94)'],
])('%s labels and direction agree with map colour bands', (metric, low, high, firstColor) => {
  const { getByRole, getByText } = render(<GridAccessLegend metric={metric} />);
  expect(getByText(low)).toBeDefined(); expect(getByText(high)).toBeDefined();
  const bands = getByRole('group', { name: 'Grid access map legend' }).querySelectorAll('[aria-hidden] span');
  expect(bands).toHaveLength(3);
  expect(bands[0].style.backgroundColor).toBe(firstColor);
  expect(bands[1].style.backgroundColor).toBe('rgb(245, 158, 11)');
  expect(bands[2].style.backgroundColor).toBe(metric === 'available_mw' ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)');
  expect(getByText(/Unreported values/)).toBeDefined();
});
