import React, { act } from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, waitFor } from '@testing-library/react';
import MixedGranularityControls from './MixedGranularityControls';
import { buildMixedGranularityPlan, MIXED_GRANULARITY_DEFAULTS } from '../mixedGranularity';

const countries = [
  { countryCode: 'BE', countryName: 'Belgium' },
  { countryCode: 'FR', countryName: 'France' },
];

test('stages multiple focus countries, full model extent and applies it once', async () => {
  const onApply = jest.fn();
  const view = render(<MixedGranularityControls countryOptions={countries} activeCountryCode="BE" onApply={onApply} />);
  fireEvent.click(view.getByRole('button', { name: /mixed tso rings/i }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Focus France' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Mixed TSO extent' }), { target: { value: 'full' } });
  fireEvent.change(view.getByRole('combobox', { name: 'Direct grid neighbours resolution' }), { target: { value: 'nuts2' } });
  await act(async () => { fireEvent.click(view.getByRole('button', { name: 'Build mixed view' })); });
  expect(onApply).toHaveBeenCalledWith(['BE', 'FR'], {
    focus: 'full', adjacent: 'nuts2', outer: 'bidding_zone', periphery: 'bidding_zone', remaining: 'bidding_zone',
  }, { scope: 'full', regions: [] });
});

test('summarises an active plan without dumping its country list', () => {
  const plan = { focusCode: 'BE', adjacent: ['DE', 'FR', 'NL'], outer: ['ES', 'IT'] };
  const view = render(<MixedGranularityControls countryOptions={countries} activePlan={plan} onApply={jest.fn()} />);
  expect(view.getByText('1 focus · 6 countries · 0 regions')).toBeInTheDocument();
  expect(view.getByText('Edit')).toBeInTheDocument();
});

test('automatic proposal is staged, editable and never applies immediately', async () => {
  const options = [...countries, { countryCode: 'ES', countryName: 'Spain' }, { countryCode: 'PT', countryName: 'Portugal' }];
  const onApply = jest.fn();
  const facilities = options.map(({ countryCode }) => ({ id: countryCode, country: countryCode, component_type: 'Bus' }));
  const plan = buildMixedGranularityPlan(['BE'], options.map(option => option.countryCode), MIXED_GRANULARITY_DEFAULTS, { scope: 'full' });
  const view = render(<MixedGranularityControls countryOptions={options} activeCountryCode="BE" activePlan={plan} onApply={onApply}
    facilities={facilities} connections={[{ from: 'ES', to: 'PT' }]} />);
  fireEvent.click(view.getByRole('button', { name: /mixed tso rings/i }));
  fireEvent.change(view.getByLabelText('Aggregation method'), { target: { value: 'ai' } });
  expect(view.getByText(/Automatic — inferred from grid connectivity/)).toBeInTheDocument();
  expect(view.queryByLabelText('Maximum groups')).not.toBeInTheDocument();
  fireEvent.click(view.getByLabelText('Override manually'));
  expect(view.getByLabelText('Maximum countries per region')).toBeInTheDocument();
  fireEvent.click(view.getByLabelText('Override manually'));
  fireEvent.click(view.getByText('Propose regions'));
  expect(view.getByRole('status').textContent).toContain('ES + PT');
  expect(view.getByRole('status').textContent).toContain('Automatic size: largest proposed region has 2 countries.');
  expect(view.getByRole('status').textContent).toContain('Separate countries:');
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(view.getByText('Use proposal (replace staged regions)'));
  expect(onApply).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(view.getByText('Build mixed view')));
  expect(onApply.mock.calls[0][2].regions).toEqual([{ name: 'ES + PT', countryCodes: ['ES', 'PT'] }]);
});

test('proposal waits for the mixed-cache load before using newly loaded buses and links', async () => {
  const options = [...countries, { countryCode: 'ES', countryName: 'Spain' }, { countryCode: 'PT', countryName: 'Portugal' }];
  const plan = buildMixedGranularityPlan(['BE'], options.map(option => option.countryCode), MIXED_GRANULARITY_DEFAULTS, { scope: 'full' });
  const loadedFacilities = options.map(({ countryCode }) => ({ id: countryCode, country: countryCode, component_type: 'Bus' }));
  let finishLoad;
  const onApply = jest.fn(() => new Promise(resolve => { finishLoad = resolve; }));
  const initialProps = { countryOptions: options, activeCountryCode: 'BE', onApply, facilities: [loadedFacilities[0]], connections: [] };
  const view = render(<MixedGranularityControls {...initialProps} />);
  fireEvent.click(view.getByRole('button', { name: /mixed tso rings/i }));
  fireEvent.change(view.getByLabelText('Mixed TSO extent'), { target: { value: 'full' } });
  fireEvent.change(view.getByLabelText('Aggregation method'), { target: { value: 'ai' } });
  fireEvent.click(view.getByText('Propose regions'));
  expect(onApply).toHaveBeenCalledTimes(1);
  view.rerender(<MixedGranularityControls {...initialProps} activePlan={plan}
    facilities={loadedFacilities} connections={[{ from: 'ES', to: 'PT' }]} />);
  await act(async () => {
    finishLoad(plan);
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(view.getByRole('status').textContent).toContain('ES + PT'));
  expect(view.getByRole('status').textContent).not.toContain('No cached electricity buses');
});
