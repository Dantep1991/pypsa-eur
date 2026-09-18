import React from 'react';
import { render } from '@testing-library/react';
import LandSampleSummary from './LandSampleSummary';

const roles = { hard_constraint: 10, conditional_constraint: 30, opportunity: 5 };

test.each([undefined, 'no_local_land_cover', 'outside_selected_countries'])(
  'empty samples do not show zero percentages, including old backend responses (%s)', reason => {
    const view = render(<LandSampleSummary stats={{ sample_count: 0,
      roles_percent: { hard_constraint: 0, conditional_constraint: 0, opportunity: 0 }, no_data_reason: reason }} />);
    expect(view.getByRole('status').textContent).toMatch(/No (local land-cover data|selected-country area)/);
    expect(view.queryByText('0%')).toBeNull();
  },
);

test('partial coverage explains the percentage denominator and unknown remainder', () => {
  const view = render(<LandSampleSummary countryScoped stats={{ sample_count: 100, coverage_sample_percent: 25, roles_percent: roles }} />);
  expect(view.getByText('10%')).toBeDefined();
  expect(view.getByRole('status').textContent).toContain('25%');
  expect(view.getByText(/Percentages of sampled land with known cover/).textContent).toContain('country-clipped');
});

test('full coverage and legacy positive samples retain the summary', () => {
  const view = render(<LandSampleSummary stats={{ sample_count: 100, roles_percent: roles }} />);
  expect(view.getByText('5%')).toBeDefined();
  expect(view.queryByRole('status')).toBeNull();
  view.rerender(<LandSampleSummary stats={{ sample_count: 100, coverage_sample_percent: 100, roles_percent: roles }} />);
  expect(view.queryByRole('status')).toBeNull();
});

test.each([{}, { sample_count: 1, roles_percent: { ...roles, opportunity: null } },
  { sample_count: 1, roles_percent: { ...roles, hard_constraint: 101 } }])('malformed summary is not presented as evidence', stats => {
  const view = render(<LandSampleSummary stats={stats} />);
  expect(view.getByRole('status').textContent).toContain('unavailable');
});
