import React from 'react';
import { act, render, cleanup, fireEvent } from '@testing-library/react';
import App from './App';
import { pypsaCatalogueCacheKey, writePypsaCatalogueCache } from './pypsaCatalogueCache';

jest.mock('./components/EnhancedLeafletMapWithVoice', () => () => <div data-testid="atlas-map" />);

test('PyPSA startup does not load legacy workbook or example CSV map data', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, ready: true, status: 'healthy', files: [], countries: [], data: [], networks: [] }),
    text: async () => '',
  }));
  try {
    const view = render(<App />);
    await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
    expect(view.getByTestId('atlas-map')).not.toBeNull();
    const requests = global.fetch.mock.calls.map(([url]) => String(url));
    expect(requests.filter((url) => /\/api\/atlas\/(?:land|grid-access)\/status/.test(url))).toEqual([]);
    expect(requests.filter((url) => /\/api\/emil\/(?:properties|memberships|node-coordinates-map)/.test(url))).toEqual([]);
    expect(requests.filter((url) => url.includes('nodal_coordinates.csv'))).toEqual([]);
    await act(async () => {
      jest.advanceTimersByTime(600_000);
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    const allRequests = global.fetch.mock.calls.map(([url]) => String(url));
    expect(allRequests.filter((url) => /\/api\/atlas\/(?:land|grid-access)\/status/.test(url))).toEqual([]);
  } finally {
    cleanup();
    global.fetch = originalFetch;
    jest.useRealTimers();
  }
});

test('offline catalogue retries back off, pause while hidden, and recover on foreground return', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  let visibility = 'visible';
  let catalogueHealthy = false;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/api/pypsa/list-files')) {
      return catalogueHealthy
        ? { ok: true, json: async () => ({ files: [], source: 'local' }) }
        : { ok: false, status: 503, text: async () => 'Offline' };
    }
    return {
      ok: true,
      json: async () => ({ success: true, ready: true, status: 'healthy', files: [], countries: [], data: [], networks: [] }),
      text: async () => '',
    };
  });
  const flush = async () => act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
  const catalogueCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).includes('/api/pypsa/list-files')).length;
  try {
    render(<App />);
    await flush();
    expect(catalogueCalls()).toBe(1);

    act(() => jest.advanceTimersByTime(1999));
    await flush();
    expect(catalogueCalls()).toBe(1);
    act(() => jest.advanceTimersByTime(1));
    await flush();
    expect(catalogueCalls()).toBe(2);

    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => jest.advanceTimersByTime(600_000));
    await flush();
    expect(catalogueCalls()).toBe(2);

    catalogueHealthy = true;
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(catalogueCalls()).toBe(3);
    act(() => jest.advanceTimersByTime(600_000));
    await flush();
    expect(catalogueCalls()).toBe(3);
  } finally {
    cleanup();
    global.fetch = originalFetch;
    if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
    else delete document.visibilityState;
    jest.useRealTimers();
  }
});

test('an offline reload keeps the saved country catalogue usable while reconnecting', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  const cacheKey = pypsaCatalogueCacheKey('pypsa', 'auto');
  window.localStorage.removeItem(cacheKey);
  writePypsaCatalogueCache(window.localStorage, 'pypsa', 'auto', {
    source: 'local',
    capabilities: { parse_nc_omit_geojson_overlays: true },
    files: [
      { filename: 'base_BE.nc', is_distill: false },
      { filename: 'base_FR_nuts3.nc', is_distill: false, geographic_country: 'FR', geographic_level: 'nuts3' },
    ],
  });
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/api/pypsa/list-files')) {
      return { ok: false, status: 503, text: async () => 'Offline' };
    }
    return {
      ok: true,
      json: async () => ({ success: true, ready: true, status: 'healthy', files: [], countries: [], data: [], networks: [] }),
      text: async () => '',
    };
  });
  try {
    const view = render(<App />);
    await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); });
    const geography = view.getByRole('button', { name: /Geography Domain/ });
    if (geography.getAttribute('aria-expanded') === 'false') fireEvent.click(geography);
    const countrySelector = view.getByRole('combobox', { name: 'Add country network' });
    expect(countrySelector.disabled).toBe(false);
    expect(view.getByRole('option', { name: 'Belgium (BE)' })).not.toBeNull();
    expect(view.getByRole('option', { name: 'France (FR)' })).not.toBeNull();
    expect(view.getByRole('status', { name: 'Country catalogue status' }).textContent).toMatch(/Showing the saved country catalogue/);
    expect(global.fetch.mock.calls.filter(([url]) => String(url).includes('/api/pypsa/list-files'))).toHaveLength(1);
  } finally {
    cleanup();
    window.localStorage.removeItem(cacheKey);
    global.fetch = originalFetch;
    jest.useRealTimers();
  }
});
