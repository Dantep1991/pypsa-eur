import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import App from './App';

jest.mock('./components/EnhancedLeafletMapWithVoice', () => () => <div data-testid="atlas-map" />);

const response = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const flush = () => act(async () => { for (let i = 0; i < 32; i += 1) await Promise.resolve(); });
const topology = {
  schema: 'nohm.atlas.model-scene.v1', project_id: 'model', version: 'v1', carrier: 'electricity', selected_year: 2030,
  layers: ['grid'], nodes: [{ id: 'Node:BE00', name: 'BE00', country: 'BE', position: { lat: 50.8, lon: 4 } }],
  links: [], assets: [], coverage: { counts: { nodes: 1, mapped_nodes: 1, links: 0 }, warnings: [] },
};
const summary = { projects: ['case'], tscDelta: { '2050': { case: { total: -100 } } },
  sewDelta: { '2050': { case: { ps_elec: 20 } } } };
const originalFetch = global.fetch;
let originalContext;

beforeEach(() => {
  jest.useFakeTimers();
  originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId: 'model', version: 'v1' };
  window.localStorage.clear();
  global.fetch = jest.fn(async (url, options = {}) => {
    const path = String(url);
    if (path.endsWith('/api/theo/projects')) return response({ projects: [] }); // No registration.
    if (path.endsWith('/api/theo/projects/model/cba-summary')) return response(summary);
    if (path.includes('/atlas-cba-map?')) return response({
      schema: 'nohm.atlas.cba-map.v1', studyId: 'model', caseId: 'case', band: '2050', component: 'producer',
      countries: [{ country: 'BE', value: 20 }], assets: [], notes: [], totalSystemCostDelta: -100,
    });
    if (path.includes('/api/emil/database/coordinates?')) return response({ coordinates: { BE: { lat: 50.8, lon: 4 } } });
    if (path.includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk' }) };
    if (path.includes('/scene?')) return response(topology);
    if (path.endsWith('/api/map-agent/interpret')) return response({ provider: 'test', confidence: .99, actions: [{
      intent: 'control_workspace', params: { workspace: 'cba', action: 'show', binding: 'model:v1', values: { component: 'producer' } },
    }] });
    if (path.endsWith('/api/map-agent/judge')) return response({ confidence: .99, verdict: 'pass', corrections: [], summary: 'Producer rents shown.' });
    return response({ success: true, ready: true, status: 'healthy', files: [], countries: [], carriers: [], data: [], networks: [], classes: [], objects: [] });
  });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
  window.localStorage.clear();
  jest.useRealTimers();
});

test('unregistered saved CBA enables the UI and the agent judge reads its completed live controller state', async () => {
  const view = render(<App />);
  await flush();
  const rail = within(view.getByRole('navigation', { name: 'Atlas workspace areas' }));
  fireEvent.click(rail.getByRole('button', { name: 'Visualise', exact: true }));
  expect(view.getByRole('button', { name: 'Cost-benefit analysis', exact: true })).toBeEnabled();
  fireEvent.click(view.getByRole('button', { name: 'Open map assistant' }));
  fireEvent.change(view.getByRole('textbox', { name: 'Message EMIL' }), { target: { value: 'show producer rents' } });
  fireEvent.click(view.getByRole('button', { name: 'Send assistant message' }));
  // Drive the real controller opening, committed result state and audit delays.
  for (let i = 0; i < 16; i += 1) {
    await flush();
    act(() => jest.advanceTimersByTime(100));
  }
  await flush();
  const audits = global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/map-agent/judge'));
  expect(audits).toHaveLength(1);
  const observed = JSON.parse(audits[0][1].body).afterContext.agentWorkspaces;
  expect(observed.binding).toBe('model:v1');
  expect(observed.workspaces.cba.state).toMatchObject({
    loading: false, component: 'producer', displayed: { mapped: 1, selection: { caseId: 'case', band: '2050', component: 'producer' } },
  });
  expect(view.getByRole('log')).toHaveTextContent('1 assessed CBA values shown.');
  expect(view.getByRole('log')).not.toHaveTextContent('still loading');
  expect(view.getByRole('combobox', { name: 'CBA value' })).toHaveValue('producer');
  expect(view.getByRole('region',{name:'Map assistant'}).parentElement).toHaveClass('z-[810]');
});

test('the trusted platform overlay executes the same live CBA controls and returns one confirmed receipt', async () => {
  const posted = jest.spyOn(window, 'postMessage').mockImplementation(() => {});
  const view = render(<App />);
  await flush();
  act(() => window.dispatchEvent(new MessageEvent('message', {
    source: window.parent, origin: window.location.origin,
    data: { type: 'nohm.atlas.prompt.v1', protocolVersion: 1, requestId: 'platform-cba',
      message: 'show producer rents', history: [] },
  })));
  for (let i = 0; i < 16; i += 1) {
    await flush();
    act(() => jest.advanceTimersByTime(100));
  }
  await flush();
  const receipts = posted.mock.calls.map(([value]) => value).filter(value =>
    value.type === 'nohm.atlas.prompt-receipt.v1' && value.requestId === 'platform-cba' && value.status !== 'progress');
  expect(receipts).toEqual([expect.objectContaining({ handled: true, status: 'applied' })]);
  expect(view.getByRole('combobox', { name: 'CBA value' })).toHaveValue('producer');
  const planned = global.fetch.mock.calls.filter(([url]) => String(url).endsWith('/api/map-agent/interpret'));
  expect(JSON.parse(planned[0][1].body).mapContext).toMatchObject({
    supportsAgentHandoff: true, agentWorkspaces: { binding: 'model:v1' },
  });
  expect(JSON.parse(planned[0][1].body).mapContext.analysisHandoff.guidance)
    .toContain('Display existing reported results and numerical comparison maps');
  posted.mockRestore();
});
