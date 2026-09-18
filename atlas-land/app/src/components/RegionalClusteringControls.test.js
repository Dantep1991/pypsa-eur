import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import RegionalClusteringControls from './RegionalClusteringControls';


const clusterPayload = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { NUTS_ID: 'ES11', cluster: 1, color: '#dabd1d' },
    },
  ],
  meta: {
    level: 2,
    mapped_regions: 19,
    indicators: ['density', 'gdp', 'employment'],
  },
  profiles: [
    { cluster: 1, color: '#dabd1d', regions: 19, averages: { density: 94, gdp: 30200 } },
  ],
  assignments: [],
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => clusterPayload,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('builds a country-scoped overlay and atomically refreshes colours when settings change', async () => {
  const onOverlayChange = jest.fn();
  render(<RegionalClusteringControls countryCodes={['ES', 'PT']} onOverlayChange={onOverlayChange} />);

  fireEvent.click(screen.getByRole('button', { name: 'Build regional clusters' }));

  await screen.findByText(/19 NUTS 2 regions clustered across 2 countries/i);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const requestUrl = String(global.fetch.mock.calls[0][0]);
  expect(requestUrl).toContain('/api/atlas/clusters?');
  expect(requestUrl).toContain('countries=ES%2CPT');
  expect(requestUrl).toContain('indicators=density%2Cgdp%2Cemployment');
  await waitFor(() => expect(onOverlayChange).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ features: clusterPayload.features }),
    meta: clusterPayload.meta,
  })));

  const nullCallsBeforeRefresh = onOverlayChange.mock.calls.filter(([value]) => value === null).length;
  fireEvent.change(screen.getByLabelText('Cluster reference year'), { target: { value: '2022' } });
  expect(await screen.findByText(/Updating cluster colours/i)).toBeInTheDocument();
  expect(onOverlayChange.mock.calls.filter(([value]) => value === null)).toHaveLength(nullCallsBeforeRefresh);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(String(global.fetch.mock.calls[1][0])).toContain('year=2022');
  await waitFor(() => expect(screen.getByText(/19 NUTS 2 regions clustered across 2 countries/i)).toBeInTheDocument());
  expect(onOverlayChange).toHaveBeenLastCalledWith(expect.objectContaining({
    data: expect.objectContaining({ features: clusterPayload.features }),
  }));
});

test('NUTS 3 removes NUTS 2-only labour indicators before requesting data', async () => {
  render(<RegionalClusteringControls countryCodes={['ES']} onOverlayChange={jest.fn()} />);

  fireEvent.change(screen.getByLabelText('Cluster region level'), { target: { value: '3' } });
  expect(screen.getByText('Employment rate').closest('label')).toHaveClass('opacity-35');
  fireEvent.click(screen.getByRole('button', { name: 'Build regional clusters' }));

  await screen.findByText(/19 NUTS 3 regions clustered across 1 country/i);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const requestUrl = String(global.fetch.mock.calls[0][0]);
  expect(requestUrl).toContain('level=3');
  expect(requestUrl).toContain('indicators=density%2Cgdp');
  expect(requestUrl).not.toContain('employment');
});

test('requires geography and lets a user cancel a slow request', async () => {
  const { rerender } = render(
    <RegionalClusteringControls countryCodes={[]} onOverlayChange={jest.fn()} />,
  );
  expect(screen.getByRole('button', { name: 'Build regional clusters' })).toBeDisabled();
  expect(screen.getByText(/Add at least one country/i)).toBeInTheDocument();

  global.fetch = jest.fn().mockImplementation((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  rerender(<RegionalClusteringControls countryCodes={['ES']} onOverlayChange={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Build regional clusters' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel clustering' }));

  expect(await screen.findByText(/Clustering cancelled/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Build regional clusters' })).toBeEnabled();
});
