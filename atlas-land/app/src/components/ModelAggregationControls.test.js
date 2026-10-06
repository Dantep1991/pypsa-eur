import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ModelAggregationControls from './ModelAggregationControls';

const catalog = { native_resolution: 'bidding_zone', regional_registry: { schemes: [
  { id: 'ec-high-level', name: 'European Commission', regions: [
    { id: 'south', name: 'South-West Europe', countries: ['FR', 'ES', 'PT'], edition: '2026', source_url: 'https://energy.ec.europa.eu/' },
    { id: 'north', name: 'North Sea', countries: ['FR', 'BE'] },
  ] }, { id: 'entsog-grip', name: 'ENTSOG', regions: [] },
] } };

test('unknown native resolution never enables bidding-zone projection', () => {
  render(<ModelAggregationControls catalog={null} countries={['FR']} value="native" status={{ state: 'idle' }} onApply={jest.fn()} />);
  expect(screen.getByRole('option', { name: /Bidding Zone/ }).disabled).toBe(true);
  expect(screen.getByRole('option', { name: 'Country' }).disabled).toBe(false);
});

test('Joule e-Highway native geography retains a selectable bidding-zone view', () => {
  const onApply = jest.fn();
  render(<ModelAggregationControls catalog={{ ...catalog, native_resolution: 'ehighway' }} countries={['FR', 'ES']}
    value="native" nativeLabel="e-Highway zones" status={{ state: 'idle' }} onApply={onApply} />);
  expect(screen.getByRole('option', { name: 'Bidding Zone' }).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText('Model network geography'), { target: { value: 'bidding_zone' } });
  expect(onApply).toHaveBeenCalledWith('bidding_zone');
});

test('multiple published regions can be selected and application has a clear enabled state', () => {
  const onApply = jest.fn();
  render(<ModelAggregationControls catalog={catalog} countries={['FR', 'ES', 'PT', 'BE']} value="native" nativeLabel="Bidding zones" status={{ state: 'idle' }} onApply={onApply} />);
  expect(screen.getByRole('option', { name: /NUTS3/ }).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Model network geography'), { target: { value: 'country' } });
  expect(onApply).toHaveBeenCalledWith('country');
  fireEvent.change(screen.getByLabelText('Model network geography'), { target: { value: 'regional' } });
  expect(screen.getByRole('button', { name: 'Apply regions' }).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/South-West Europe/));
  expect(screen.getByLabelText(/North Sea/).disabled).toBe(false);
  fireEvent.click(screen.getByLabelText(/North Sea/));
  expect(screen.getByRole('button', { name: 'Apply regions' }).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Apply regions' }));
  expect(onApply).toHaveBeenLastCalledWith('regional', { schemeId: 'ec-high-level', regionIds: ['south', 'north'] });
});
