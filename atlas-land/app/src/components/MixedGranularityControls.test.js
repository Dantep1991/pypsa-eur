import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render } from '@testing-library/react';
import MixedGranularityControls from './MixedGranularityControls';

const countries = [
  { countryCode: 'BE', countryName: 'Belgium' },
  { countryCode: 'FR', countryName: 'France' },
];

test('stages a three-tier TSO view and applies it once', async () => {
  const onApply = jest.fn();
  const view = render(<MixedGranularityControls countryOptions={countries} activeCountryCode="BE" onApply={onApply} />);
  fireEvent.click(view.getByRole('button', { name: /mixed tso rings/i }));
  fireEvent.change(view.getByRole('combobox', { name: 'Mixed granularity focus country' }), { target: { value: 'FR' } });
  fireEvent.change(view.getByRole('combobox', { name: 'Direct grid neighbours resolution' }), { target: { value: 'nuts2' } });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Build mixed view' })); });
  expect(onApply).toHaveBeenCalledWith('FR', {
    focus: 'full', adjacent: 'nuts2', outer: 'bidding_zone',
  });
});

test('summarises an active plan without dumping its country list', () => {
  const plan = { focusCode: 'BE', adjacent: ['DE', 'FR', 'NL'], outer: ['ES', 'IT'] };
  const view = render(<MixedGranularityControls countryOptions={countries} activePlan={plan} onApply={jest.fn()} />);
  expect(view.getByText('BE · 3 direct · 2 outer')).toBeInTheDocument();
  expect(view.getByText('Edit')).toBeInTheDocument();
});
