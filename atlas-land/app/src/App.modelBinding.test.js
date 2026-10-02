import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import App from './App';

let mockMapFrames = [];
jest.mock('./components/EnhancedLeafletMapWithVoice', () => props => {
  mockMapFrames.push(props);
  return <div data-testid="atlas-map" />;
});

const scene = {
  schema: 'nohm.atlas.model-scene.v1', project_id: 'Model_A', version: 'v1',
  carrier: 'electricity', selected_year: 2030, layers: ['grid'],
  nodes: [
    { id: 'Node:BE00', name: 'BE00', country: 'BE', position: { lat: 50.8, lon: 4 } },
    { id: 'Node:FR00', name: 'FR00', country: 'FR', position: { lat: 46.2, lon: 2.2 } },
    { id: 'Node:unmapped', name: 'Unmapped', country: 'BE', position: null },
  ],
  links: [{ id: 'Line:BE-FR', from_node: 'Node:BE00', to_node: 'Node:FR00' }], assets: [],
  coverage: { counts: { nodes: 3, mapped_nodes: 2, links: 1 }, warnings: ['1 unmapped'] },
};
const flush = () => act(async () => { for (let i = 0; i < 24; i += 1) await Promise.resolve(); });

test.each(['ready', 'missing', 'wrong-version'])('project binding stays closed when metadata is absent: %s', async state => {
  jest.useFakeTimers();
  const originalFetch = global.fetch;
  const originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  const originalCarrier = window.localStorage.getItem('atlas-network-carrier');
  const originalOverlay = window.localStorage.getItem('atlas-network-overlay-mode');
  mockMapFrames = [];
  // Reproduce the old metadata-404 fallback and unrelated Studio preferences.
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'reference', projectId: 'Model_A', version: 'v1' };
  window.localStorage.setItem('atlas-network-carrier', 'gas');
  window.localStorage.setItem('atlas-network-overlay-mode', 'true');
  global.fetch = jest.fn(async url => {
    if (String(url).includes('/projects/Model_A/aggregation-catalog?')) return {
      ok: false, status: 404, json: async () => ({ detail: 'No registered crosswalk' }),
    };
    if (String(url).includes('/projects/Model_A/scene?')) return {
      ok: state !== 'missing', status: state === 'missing' ? 404 : 200,
      json: async () => state === 'missing' ? { detail: 'Project scene unavailable' }
        : { ...scene, version: state === 'wrong-version' ? 'v2' : 'v1' },
    };
    return { ok: true, status: 200, json: async () => ({
      success: true, ready: true, status: 'healthy', files: [], countries: [], data: [], networks: [],
    }), text: async () => '' };
  });
  try {
    const view = render(<App />);
    await flush();
    const geography = view.getByRole('button', { name: /Geography Domain/ });
    if (geography.getAttribute('aria-expanded') === 'false') fireEvent.click(geography);
    expect(view.queryByRole('combobox', { name: 'Add country network' })).toBeNull();
    expect(view.queryByRole('slider')).toBeNull();
    expect(view.getByRole('combobox', { name: 'Network carrier' }).disabled).toBe(true);
    expect(view.getByRole('button', { name: 'Toggle multi-network overlay' }).disabled).toBe(true);
    const geographyOptions = Array.from(view.getByRole('combobox', { name: 'Model network geography' }).options);
    expect(geographyOptions.filter(option => !option.disabled).map(option => option.value)).toEqual(['native', 'country', 'regional']);
    expect(geographyOptions.filter(option => ['full', 'nuts3', 'nuts2', 'nuts1', 'ehighway', 'bidding_zone'].includes(option.value))
      .every(option => option.disabled)).toBe(true);
    if (state === 'ready') {
      await waitFor(() => expect(mockMapFrames.at(-1).facilities.map(node => node.id)).toEqual(['Node:BE00', 'Node:FR00']));
      const facilities = mockMapFrames.at(-1).facilities;
      expect(facilities.map(node => node.id)).toEqual(['Node:BE00', 'Node:FR00']);
      expect(facilities.every(node => node.source_model_project === 'Model_A' && node.source_model_version === 'v1')).toBe(true);
    } else {
      const facilities = mockMapFrames.at(-1).facilities;
      expect(facilities).toEqual([]);
      expect(view.container.textContent).toMatch(state === 'missing' ? /Project scene unavailable/ : /requested model version v1/);
    }
    const requests = global.fetch.mock.calls.map(([url]) => String(url));
    expect(requests.some(url => url.includes('version=v1'))).toBe(true);
    expect(requests.filter(url => /parse-nc|\/atlas\/(?:gas|water|liquids|logistics)\/network/.test(url))).toEqual([]);
  } finally {
    cleanup();
    window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    for (const [key, value] of [['atlas-network-carrier', originalCarrier], ['atlas-network-overlay-mode', originalOverlay]]) {
      if (value == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
    global.fetch = originalFetch;
    jest.useRealTimers();
  }
});
