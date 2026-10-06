import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ModelCountryScopeControls from './ModelCountryScopeControls';
const props = { availableCountries: ['EE', 'DK', 'DE'], selectedCountries: [], onSelect: jest.fn(), onSelectAll: jest.fn(), countryName: code => code };
test('choosing a country applies it immediately, and further selections accumulate', () => {
  const view = render(<ModelCountryScopeControls {...props} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'EE' } });
  expect(props.onSelect).toHaveBeenLastCalledWith(['EE']);
  expect(screen.getByRole('combobox')).toHaveValue('');
  view.rerender(<ModelCountryScopeControls {...props} selectedCountries={['EE']} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DK' } });
  expect(props.onSelect).toHaveBeenLastCalledWith(['DK', 'EE']);
  expect(screen.queryByRole('button', { name: 'Add country to model view' })).not.toBeInTheDocument();
});
test('selection is disabled while the existing view is loading', () => {
  render(<ModelCountryScopeControls {...props} busy />);
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByRole('status')).toHaveAccessibleName('Updating country view');
});
