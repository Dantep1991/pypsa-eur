import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, within } from '@testing-library/react';
import LoadedCountryList from './LoadedCountryList';

const networks = ['Albania', 'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Denmark', 'France', 'Spain'].map((countryName, i) => ({
  countryName, countryCode: ['AL', 'AT', 'BE', 'BG', 'HR', 'DK', 'FR', 'ES'][i],
}));
const setup = (props = {}) => {
  const onActivate = jest.fn();
  const onRemove = jest.fn();
  return { onActivate, onRemove, ...render(<LoadedCountryList networks={networks} activeCountryCode="ES"
    onActivate={onActivate} onRemove={onRemove} {...props} />) };
};

test('compact preview always includes the active country without changing membership', () => {
  const view = setup();
  const list = within(view.getByLabelText('Loaded countries'));
  expect(list.getAllByRole('button')).toHaveLength(12);
  expect(list.getByRole('button', { name: 'Spain', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(view.getByText('8 countries loaded · 2 more in Manage')).toBeInTheDocument();
  expect(view.onActivate).not.toHaveBeenCalled();
  expect(view.onRemove).not.toHaveBeenCalled();
});

test('search finds loaded countries by code or name and delegates focus/removal unchanged', () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: 'Manage 8 countries' }));
  const search = view.getByRole('searchbox', { name: 'Search loaded countries' });
  fireEvent.change(search, { target: { value: ' fr ' } });
  fireEvent.click(view.getByRole('button', { name: 'France', exact: true }));
  expect(view.onActivate).toHaveBeenCalledWith(networks[6]);
  fireEvent.click(view.getByRole('button', { name: 'Remove France' }));
  expect(view.onRemove).toHaveBeenCalledWith('FR');
  expect(view.getByText('1 of 8 countries')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'not loaded' } });
  expect(view.getByRole('status')).toHaveTextContent('No selected countries match');
});

test('Escape clears the query then collapses and restores keyboard focus', () => {
  const view = setup();
  fireEvent.click(view.getByRole('button', { name: 'Manage 8 countries' }));
  const search = view.getByRole('searchbox');
  fireEvent.change(search, { target: { value: 'France' } });
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(search).toHaveValue('');
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(view.getByRole('button', { name: 'Manage 8 countries' })).toHaveFocus();
  expect(view.queryByRole('searchbox')).not.toBeInTheDocument();
  expect(view.onActivate).not.toHaveBeenCalled();
  expect(view.onRemove).not.toHaveBeenCalled();
});

test('loading locks network mutations but allows the selection to be inspected', () => {
  const view = setup({ disabled: true });
  fireEvent.click(view.getByRole('button', { name: 'Manage 8 countries' }));
  for (const button of within(view.getByLabelText('Loaded countries')).getAllByRole('button')) {
    expect(button).toBeDisabled();
    fireEvent.click(button);
  }
  expect(view.onActivate).not.toHaveBeenCalled();
  expect(view.onRemove).not.toHaveBeenCalled();
});

test('small selections need no extra management step', () => {
  const view = setup({ networks: networks.slice(0, 3), activeCountryCode: 'BE' });
  expect(view.queryByText(/Manage/)).not.toBeInTheDocument();
  expect(within(view.getByLabelText('Loaded countries')).getAllByRole('button')).toHaveLength(6);
});
