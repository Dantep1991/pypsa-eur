import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import App from './App';

jest.mock('./components/EnhancedLeafletMapWithVoice', () => props => <div data-testid="atlas-map">
  {(props.getFilteredFacilities?.() || []).filter(row => !row.atlas_distillation_hidden).map(row =>
    <span key={row.id}>{row.id}:{row.atlas_distillation_status || 'native'}</span>)}
</div>);

const response = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const flush = () => act(async () => { for (let i = 0; i < 32; i += 1) await Promise.resolve(); });
const topology = {
  schema: 'nohm.atlas.model-scene.v1', project_id: 'model', version: 'v1', carrier: 'electricity', selected_year: 2030,
  layers: ['grid'], nodes: [
    { id: 'Node:ES00', name: 'ES00', country: 'ES', position: { lat: 40, lon: -4 } },
    { id: 'Node:FR00', name: 'FR00', country: 'FR', position: { lat: 46, lon: 2 } },
  ], links: [], assets: [], coverage: { counts: { nodes: 2, mapped_nodes: 2, links: 0 }, warnings: [] },
};
const originalFetch = global.fetch;
let originalContext;

beforeEach(() => {
  jest.useFakeTimers();
  originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId: 'model', version: 'v1' };
  window.localStorage.clear();
  global.fetch = jest.fn(async url => {
    const path = String(url);
    if (path.includes('/distillation/options?')) return response({
      schema: 'nohm.atlas.distillation-workflow.v1', project_id: 'model', source_version: 'v1',
      countries: [{ id: 'ES', label: 'Spain' }, { id: 'FR', label: 'France' }], carriers: [], parent_runs: [],
    });
    if (path.endsWith('/distillation/preview')) return response({
      schema: 'nohm.atlas.distillation-workflow.v1', project_id: 'model', source_version: 'v1',
      job_id: 'review', state: 'preview_ready', phase: 'Preview ready', can_create: true,
    });
    if (path.includes('/distillation-preview?')) return response({
      schema: 'nohm.atlas.distillation-preview.v1', project_id: 'model', model_version: 'v1',
      layers: ['grid'], selected_year: 2030, selection: { country_codes: ['ES'] },
      capabilities: { mutates_source: false, executable: false },
      counts: { source: { total: 2 }, by_status: { retained: 1, excluded: 1 }, reconciliation: { identity_delta: 0 } },
      classifications: [
        { entity_id: 'Node:ES00', status: 'retained', reason: 'Selected country' },
        { entity_id: 'Node:FR00', status: 'excluded', reason: 'Outside selection' },
      ],
    });
    if (path.includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk' }) };
    if (path.includes('/scene?')) return response(topology);
    return response({ success: true, ready: true, status: 'healthy', files: [], countries: [], carriers: [], data: [], networks: [], classes: [], objects: [] });
  });
});

afterEach(() => {
  cleanup(); global.fetch = originalFetch;
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
  window.localStorage.clear(); jest.useRealTimers();
});

test('Preview subset also renders its exact country scope; edits clear the stale map', async () => {
  const view = render(<App />);
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Create model', exact: true }));
  await flush();
  expect(view.getByRole('complementary', { name: 'Create model', exact: true })).not.toHaveTextContent('About this tool');
  fireEvent.change(view.getByLabelText('Countries'), { target: { value: 'ES' } });
  fireEvent.change(view.getByLabelText('Country boundary'), { target: { value: 'closed' } });
  expect(view.getAllByRole('button', { name: 'Preview subset' })).toHaveLength(1);
  expect(view.queryByText('Map-only preview')).not.toBeInTheDocument();
  fireEvent.click(view.getByRole('button', { name: 'Preview subset' }));
  await flush();
  const mapCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('/distillation-preview?'));
  expect(mapCalls).toHaveLength(1);
  expect(String(mapCalls[0][0])).toContain('countries=ES');
  const jobCall = global.fetch.mock.calls.find(([url]) => String(url).endsWith('/distillation/preview'));
  expect(JSON.parse(jobCall[1].body).countries).toEqual(['ES']);
  expect(view.getByRole('complementary', { name: 'Distillation preview legend' })).toHaveTextContent('ES · map preview');
  expect(view.queryByText(/Country selection shown on map/)).not.toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Create subset model' })).toBeEnabled();
  fireEvent.change(view.getByLabelText('Countries'), { target: { value: 'FR' } });
  await flush();
  expect(view.queryByRole('complementary', { name: 'Distillation preview legend' })).not.toBeInTheDocument();
  expect(view.queryByRole('button', { name: 'Create subset model' })).not.toBeInTheDocument();
});
