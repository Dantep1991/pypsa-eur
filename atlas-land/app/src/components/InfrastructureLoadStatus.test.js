import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import GasAtlasControls from './GasAtlasControls';
import WaterAtlasControls from './WaterAtlasControls';
import LiquidsAtlasControls from './LiquidsAtlasControls';
import LogisticsAtlasControls from './LogisticsAtlasControls';

const cases = [
  ['Methane', GasAtlasControls, 'Gas network country'],
  ['Water', WaterAtlasControls, 'Water network country'],
  ['Liquids', LiquidsAtlasControls, 'Liquids network country'],
  ['Logistics', LogisticsAtlasControls, 'Logistics country'],
];
const defaults = { hidden: false, status: { available: true, countries: ['BE'], domains: { Grid: 123 } }, countryFilter: 'BE' };
afterEach(cleanup);

test.each(cases)('%s source availability is not proof of a loaded map', (label, Controls) => {
  const view = render(<Controls {...defaults} />);
  expect(view.getByRole('status', { name: `${label} data status` }).textContent).toContain('data not loaded');
  expect(view.queryByText(/data ready/)).toBeNull();
  expect(view.getByText(/Database totals · all countries/)).toBeDefined();
});

test.each(cases)('%s distinguishes loading, checking, loaded and empty datasets', (label, Controls, countryName) => {
  const view = render(<Controls {...defaults} checking />);
  expect(view.getByRole('status').textContent).toContain('Checking');
  expect(view.getByRole('combobox', { name: countryName }).disabled).toBe(true);
  view.rerender(<Controls {...defaults} loading loaded />);
  expect(view.getByRole('status').textContent).toContain('Loading');
  expect(view.queryByText(/data ready/)).toBeNull();
  view.rerender(<Controls {...defaults} loaded />);
  expect(view.getByRole('status').textContent).toContain('data ready');
  expect(view.getByRole('combobox', { name: countryName }).disabled).toBe(false);
  view.rerender(<Controls {...defaults} loaded empty />);
  expect(view.getByRole('status').textContent).toContain('No records for this selection');
  expect(view.getByRole('status').textContent).toContain('does not establish that no infrastructure exists');
  expect(view.queryByText(/data ready/)).toBeNull();
});

test.each(cases)('%s makes failures actionable without claiming cached data was lost', (label, Controls) => {
  const onReload = jest.fn();
  const view = render(<Controls {...defaults} error="Source unavailable" onReload={onReload} />);
  expect(view.getByRole('status').textContent).toContain('data unavailable');
  expect(view.queryByText(/data ready/)).toBeNull();
  expect(view.getByText(/Reload starts with Grid/)).toBeDefined();
  fireEvent.click(view.getByRole('button', { name: `Reload ${label.toLowerCase()} grid` }));
  expect(onReload).toHaveBeenCalledTimes(1);
  view.rerender(<Controls {...defaults} error="Source unavailable" loaded onReload={onReload} />);
  expect(view.getByRole('status').textContent).toContain('update failed');
  expect(view.getByRole('status').textContent).toContain('Previously loaded layers remain available');
  expect(view.queryByText(/data ready/)).toBeNull();
});

test.each(cases)('%s does not present unknown database counts as known zeros', (label, Controls) => {
  const view = render(<Controls hidden={false} status={null} countryFilter="" />);
  expect(view.getAllByText('—')).toHaveLength(4);
});
