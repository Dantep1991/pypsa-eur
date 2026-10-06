import React from 'react';
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import App from './App';
import { clearModelSceneCache } from './modelWorkspace/modelSceneCache';

beforeEach(() => clearModelSceneCache());

let mockMapFrames = [];
jest.mock('./components/EnhancedLeafletMapWithVoice', () => props => {
  const AtlasControlPortal = require('./components/AtlasControlPortal').default;
  mockMapFrames.push(props);
  return <div data-testid="atlas-map">
    <AtlasControlPortal consolidated={props.consolidatedControls} target={props.overlaysControlHost}>
      <button onClick={() => props.onLandConstraintsChange({ enabled: true, panelOpen: true })}>Land</button>
      <button onClick={() => props.onGridAccessChange({ enabled: true, panelOpen: true })}>Access</button>
    </AtlasControlPortal>
    {(props.landConstraints?.panelOpen || props.gridAccess?.panelOpen) &&
      <button onClick={props.onMapDisplayReturn}>Back to Map display</button>}
  </div>;
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

test.each(['Joule_Model', 'TYNDP_2026_Scenarios'])('country scope filters cached input bubbles and survives display-layer changes in %s', async projectId => {
  jest.useFakeTimers();
  const originalFetch = global.fetch, originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear(); mockMapFrames = [];
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId, version: 'v1' };
  const nodeBE = { ...scene.nodes[0], class_name: 'Node', category: 'Electricity' };
  const nodeFR = { ...scene.nodes[1], class_name: 'Node', category: 'Electricity' };
  const objects = [nodeBE, nodeFR].map(node => ({ id: `plant-${node.country}`, name: `Plant ${node.country}`,
    class_name: 'Generator', category: 'Solar', properties: ['Max Capacity', 'Units'], nodes: [node] }));
  global.fetch = jest.fn(async url => {
    const path = String(url);
    if (path.includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk' }) };
    const units = path.includes('property_name=Units');
    const data = path.includes('/scene?') ? { ...scene, project_id: projectId, nodes: [nodeBE, nodeFR],
      manifest: { declared_categories: { Generator: ['Solar'] } } }
      : path.includes('/assets/inputs?') ? { project_id: projectId, model_version: 'v1', class_name: 'Generator',
        property_name: units ? 'Units' : 'Max Capacity', resolution_contract: 'nohm.modelling.input-snapshot.v1',
        input_context: { input_date: '2030-01-01T00:00' }, objects: objects.map(obj => ({ id: obj.id,
          resolution: { status: 'resolved', value: units ? 2 : obj.id === 'plant-BE' ? 100 : 500, unit: units ? '-' : 'MW' } })) }
      : path.includes('/assets?') ? { schema: 'nohm.atlas.model-assets.v1', project_id: projectId, model_version: 'v1',
        class_name: 'Generator', objects, classes: [{ class_name: 'Generator', mapped: 2, total: 2 }] }
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], carriers: [], data: [], networks: [] };
    return { ok: true, status: 200, json: async () => data, text: async () => '' };
  });
  try {
    const view = render(<App />); await flush();
    fireEvent.click(view.getByRole('button', { name: 'Model database', exact: true })); await flush();
    expect(mockMapFrames.at(-1).modelAssetsFrame.markers).toHaveLength(2);
    const inputRequests = () => global.fetch.mock.calls.filter(([url]) => String(url).includes('/assets/inputs?')).length;
    const originalRequests = inputRequests();
    fireEvent.click(view.getByRole('button', { name: 'Geography Domain', exact: true }));
    fireEvent.change(view.getByRole('combobox', { name: 'Add country to model view' }), { target: { value: 'BE' } }); await flush();
    const scoped = mockMapFrames.at(-1);
    expect(scoped.facilities.map(node => node.country)).toEqual(['BE']);
    expect(scoped.connections.map(line => line.id)).toEqual(['Line:BE-FR']);
    expect(scoped.activeCountryCodes).toEqual(['BE']);
    expect(scoped.modelAssetsFrame.markers).toHaveLength(1);
    expect(scoped.modelAssetsFrame.markers[0].objects[0].measurement.value).toBe(100);
    expect(inputRequests()).toBe(originalRequests);
    expect(global.fetch.mock.calls.some(([url]) => String(url).includes('/distillation-preview?'))).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Select all', exact: true })); await flush();
    expect(mockMapFrames.at(-1).modelAssetsFrame.markers).toHaveLength(2);
    expect(mockMapFrames.at(-1).facilities.map(node => node.country)).toEqual(['BE', 'FR']);
    expect(inputRequests()).toBe(originalRequests);
    fireEvent.change(view.getByRole('combobox', { name: 'Add country to model view' }), { target: { value: 'BE' } }); await flush();
    fireEvent.click(view.getByRole('button', { name: 'Model database', exact: true })); await flush();
    expect(view.getByRole('combobox', { name: 'Input property' }).value).toBe('Max Capacity');
    fireEvent.change(view.getByRole('combobox', { name: 'Input property' }), { target: { value: 'Units' } }); await flush();
    expect(mockMapFrames.at(-1).modelAssetsFrame.markers).toHaveLength(1);
    expect(mockMapFrames.at(-1).modelAssetsFrame.markers[0].objects[0].measurement.value).toBe(2);
    fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
    fireEvent.click(view.getByRole('button', { name: 'Supply map layer' })); await flush();
    expect(mockMapFrames.at(-1).facilities.every(node => node.country === 'BE')).toBe(true);
    expect(mockMapFrames.at(-1).activeCountryCodes).toEqual(['BE']);
    fireEvent.click(view.getByRole('button', { name: 'Geography Domain', exact: true }));
    expect(view.getByText('1 of 2 countries selected')).toBeTruthy();
  } finally {
    cleanup(); global.fetch = originalFetch; window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    window.localStorage.clear(); jest.useRealTimers();
  }
});

test.each(['Joule_Model', 'TYNDP_2026_Scenarios'])('standalone %s switches between Model and Visualise without reloading its topology', async projectId => {
  jest.useFakeTimers();
  const originalFetch = global.fetch, originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear(); mockMapFrames = [];
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId, version: 'v1' };
  global.fetch = jest.fn(async url => {
    if (String(url).includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk' }) };
    return { ok: true, status: 200, json: async () => String(url).includes('/scene?') ? { ...scene, project_id: projectId }
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], carriers: [], data: [], networks: [],
        project_id: projectId, model_version: 'v1', classes: [], objects: [] }, text: async () => '' };
  });
  try {
    const view = render(<App />); await flush();
    let rail = within(view.getByRole('navigation', { name: 'Atlas workspace areas' }));
    expect(rail.getByRole('button', { name: 'Model', exact: true }).getAttribute('aria-current')).toBe('page');
    expect(view.getByRole('button', { name: 'Model database', exact: true })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Results', exact: true })).toBeNull();
    expect(view.queryByRole('button', { name: 'Build Network', exact: true })).toBeNull();
    expect(view.queryByRole('button', { name: 'Operations Domain', exact: true })).toBeNull();
    const nodes = mockMapFrames.at(-1).facilities.map(node => node.id);
    const sceneRequests = () => global.fetch.mock.calls.filter(([url]) => String(url).includes('/scene?')).length;
    const requestCount = sceneRequests();
    fireEvent.click(view.getByRole('button', { name: 'Model database', exact: true })); await flush();
    expect(view.getByRole('region', { name: 'Model database', exact: true })).toBeTruthy();
    fireEvent.click(rail.getByRole('button', { name: 'Visualise', exact: true })); await flush();
    rail = within(view.getByRole('navigation', { name: 'Atlas workspace areas' }));
    expect(view.queryByRole('region', { name: 'Model database', exact: true })).toBeNull();
    expect(rail.getByRole('button', { name: 'Visualise', exact: true }).getAttribute('aria-current')).toBe('page');
    for (const name of ['Map display', 'Results', 'Compare', 'Grid Flow Analysis', 'Cost-benefit analysis', 'Regional clustering']) {
      expect(view.getByRole('button', { name, exact: true })).toBeTruthy();
    }
    expect(view.getByRole('button', { name: 'Results', exact: true })
      .compareDocumentPosition(view.getByRole('button', { name: 'Compare', exact: true }))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const name of ['Geography Domain', 'Model database', 'Create model', 'Model & project tools', 'More Settings']) {
      expect(view.queryByRole('button', { name, exact: true })).toBeNull();
    }
    fireEvent.click(view.getByRole('button', { name: 'Results', exact: true })); await flush();
    expect(view.getByRole('complementary', { name: 'Results', exact: true })).toBeTruthy();
    fireEvent.keyDown(rail.getByRole('button', { name: 'Visualise', exact: true }), { key: 'ArrowLeft' }); await flush();
    rail = within(view.getByRole('navigation', { name: 'Atlas workspace areas' }));
    expect(rail.getByRole('button', { name: 'Model', exact: true }).getAttribute('aria-current')).toBe('page');
    expect(view.getByRole('button', { name: 'Model database', exact: true })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Results', exact: true })).toBeNull();
    expect(view.queryByRole('complementary', { name: 'Results', exact: true })).toBeNull();
    expect(mockMapFrames.at(-1).facilities.map(node => node.id)).toEqual(nodes);
    expect(sceneRequests()).toBe(requestCount);
  } finally {
    cleanup(); global.fetch = originalFetch; window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    window.localStorage.clear(); jest.useRealTimers();
  }
});

test('regional boundary coverage stays in the information bar and clears without changing map data', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch, originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear(); mockMapFrames = [];
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId: 'Model_A', version: 'v1' };
  global.fetch = jest.fn(async url => {
    if (String(url).includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk' }) };
    return { ok: true, status: 200, json: async () => String(url).includes('/scene?') ? scene
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], carriers: [], data: [], networks: [] }, text: async () => '' };
  });
  try {
    const view = render(<App />); await flush();
    const missing = [{ id: 'r', name: 'Region', shownCountries: ['AT'], missingCountries: ['XK'], total: 2 }];
    const report = mockMapFrames.at(-1).onRegionBoundaryCoverageChange;
    act(() => report(missing));
    const notice = view.getByRole('status', { name: 'Regional boundary coverage' });
    expect(notice.closest('header').getAttribute('aria-label')).toBe('Atlas information');
    expect(notice.textContent).toBe(' · Outline missing: XK');
    const frames = mockMapFrames.length;
    act(() => report(JSON.parse(JSON.stringify(missing))));
    expect(mockMapFrames).toHaveLength(frames);
    act(() => report([]));
    expect(view.queryByRole('status', { name: 'Regional boundary coverage' })).toBeNull();
    expect(mockMapFrames.at(-1).facilities.map(node => node.id)).toEqual(expect.arrayContaining(['Node:BE00', 'Node:FR00']));
  } finally {
    cleanup(); global.fetch = originalFetch; window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    window.localStorage.clear(); jest.useRealTimers();
  }
});

test('Create model owns both saving methods and hides node views without changing the loaded model', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch, originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear(); mockMapFrames = [];
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId: 'Model_A', version: 'v1' };
  global.fetch = jest.fn(async url => {
    if (String(url).includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk' }) };
    return { ok: true, status: 200, json: async () => String(url).includes('/scene?') ? scene
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], carriers: [], data: [], networks: [] }, text: async () => '' };
  });
  try {
    const view = render(<App />); await flush();
    fireEvent.click(view.getByRole('button', { name: /Geography Domain/ }));
    fireEvent.click(view.getByRole('tab', { name: 'Mixed resolution' }));
    expect(view.queryByRole('button', { name: 'Preview model schema' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Create model', exact: true })); await flush();
    expect(mockMapFrames.at(-1).showNodeMarkers).toBe(false);
    expect(mockMapFrames.at(-1).showDataBubbles).toBe(false);
    expect(mockMapFrames.at(-1).facilities.map(node => node.id)).toEqual(expect.arrayContaining(['Node:BE00', 'Node:FR00']));
    expect(view.getByRole('tab', { name: 'Country & carrier subset' })).toBeTruthy();
    fireEvent.click(view.getByRole('tab', { name: 'Mixed resolution' }));
    expect(view.getByRole('button', { name: 'Preview model schema' }).disabled).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Apply mixed view' })); await flush();
    expect(view.getByRole('button', { name: 'Preview model schema' }).disabled).toBe(false);
    expect(mockMapFrames.at(-1).showNodeMarkers).toBe(false);
    expect(mockMapFrames.at(-1).showDataBubbles).toBe(false);
  } finally {
    cleanup(); global.fetch = originalFetch; window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    window.localStorage.clear(); jest.useRealTimers();
  }
});

test.each(['Land', 'Access'])('App returns from %s to Map display while keeping layer state and one highlighted option', async child => {
  jest.useFakeTimers();
  const originalFetch = global.fetch, originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear(); mockMapFrames = [];
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId: 'Model_A', version: 'v1' };
  global.fetch = jest.fn(async url => {
    if (String(url).includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk in fixture' }) };
    return { ok: true, status: 200, json: async () => String(url).includes('/scene?') ? scene
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], data: [], networks: [] }, text: async () => '' };
  });
  try {
    const view = render(<App />); await flush();
    const launcher = view.getByRole('button', { name: 'Map display', exact: true });
    fireEvent.click(launcher);
    fireEvent.click(view.getByRole('button', { name: 'Bubbles & pies' }));
    expect(mockMapFrames.at(-1).showDataBubbles).toBe(false);
    fireEvent.click(view.getByRole('button', { name: child, exact: true })); await flush();
    expect(launcher.className).toBe('is-active');
    expect(launcher.getAttribute('aria-current')).toBe('page');
    expect(view.queryByRole('complementary', { name: 'Map display', exact: true })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Back to Map display' })); await flush();
    expect(view.getByRole('complementary', { name: 'Map display', exact: true })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Back to Map display' })).toBeNull();
    expect(mockMapFrames.at(-1).showDataBubbles).toBe(false);
    expect(child === 'Land' ? mockMapFrames.at(-1).landConstraints.enabled : mockMapFrames.at(-1).gridAccess.enabled).toBe(true);
    expect(view.getByRole('button', { name: 'Model database', exact: true }).disabled).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Model database', exact: true })); await flush();
    expect(view.getByRole('button', { name: 'Model database', exact: true }).getAttribute('aria-current')).toBe('page');
    expect(launcher.getAttribute('aria-current')).toBeNull();
  } finally {
    cleanup(); global.fetch = originalFetch; window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    window.localStorage.clear(); jest.useRealTimers();
  }
});

test('applying regional geography enables actual member boundaries while allowing the user to hide them', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch, originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear(); mockMapFrames = [];
  window.localStorage.setItem('atlas-map-show-boundaries', 'false');
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId: 'Model_A', version: 'v1' };
  const catalog = { schema: 'nohm.atlas.aggregation-catalog.v1', project_id: 'Model_A', model_version: 'v1',
    native_resolution: 'bidding_zone', node_mapping: {}, regional_registry: { schemes: [{ id: 'ec-high-level', name: 'Published scheme', regions: [
      { id: 'connected', name: 'Connected countries', countries: ['BE', 'FR', 'ES'] },
    ] }] } };
  global.fetch = jest.fn(async url => {
    const path = String(url);
    const data = path.includes('/aggregation-catalog?') ? catalog : path.includes('/scene?') ? scene
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], data: [], networks: [] };
    return { ok: true, status: 200, json: async () => data, text: async () => '' };
  });
  try {
    const view = render(<App />); await flush();
    expect(mockMapFrames.at(-1).showGeographicBoundaries).toBe(false);
    fireEvent.click(view.getByRole('button', { name: /Geography Domain/ }));
    fireEvent.change(view.getByRole('combobox', { name: 'Model network geography' }), { target: { value: 'regional' } });
    expect(mockMapFrames.at(-1).showGeographicBoundaries).toBe(false);
    fireEvent.click(view.getByRole('checkbox', { name: /Connected countries/ }));
    fireEvent.click(view.getByRole('button', { name: 'Apply regions' })); await flush();
    expect(mockMapFrames.at(-1).showGeographicBoundaries).toBe(true);
    expect(mockMapFrames.at(-1).aggregatedRegions).toEqual([
      { id: 'connected', name: 'Connected countries', countryCodes: ['BE', 'FR'] },
    ]);
    fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
    fireEvent.click(view.getByRole('button', { name: 'Geographic boundaries' })); await flush();
    expect(mockMapFrames.at(-1).showGeographicBoundaries).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Reset map display' })); await flush();
    expect(mockMapFrames.at(-1).showGeographicBoundaries).toBe(true);
    expect(mockMapFrames.at(-1).aggregatedRegions).toEqual([]);
    expect(mockMapFrames.at(-1).viewportCommand.operation).toBe('reset');
    expect(view.getByRole('button', { name: 'Map display', exact: true }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(view.getByRole('button', { name: 'Geographic boundaries' })); await flush();
    fireEvent.click(view.getByRole('button', { name: /Geography Domain/ })); await flush();
    expect(mockMapFrames.at(-1).showGeographicBoundaries).toBe(false);
    fireEvent.change(view.getByRole('combobox', { name: 'Model network geography' }), { target: { value: 'native' } }); await flush();
    expect(mockMapFrames.at(-1).aggregatedRegions).toEqual([]);
    expect(mockMapFrames.at(-1).showGeographicBoundaries).toBe(false);
  } finally {
    cleanup(); global.fetch = originalFetch; window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    window.localStorage.clear(); jest.useRealTimers();
  }
});

test('Supply and Model database hand over one visible overlay and retain database choices', async () => {
  jest.useFakeTimers();
  const originalFetch = global.fetch, originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear(); mockMapFrames = [];
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId: 'Model_A', version: 'v1' };
  const node = { ...scene.nodes[0], class_name: 'Node', category: 'Electricity' };
  const obj = { id: 'g', name: 'Plant', class_name: 'Generator', category: 'Solar', properties: ['Max Capacity'], nodes: [node] };
  const binding = { project_id: 'Model_A', model_version: 'v1' };
  global.fetch = jest.fn(async url => {
    const path = String(url);
    if (path.includes('/aggregation-catalog?')) return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk in fixture' }) };
    const data = path.includes('/scene?') ? { ...scene, nodes: [node, scene.nodes[1]],
      manifest: { declared_categories: { Generator: ['Solar'] } } }
      : path.includes('/assets/inputs?') ? { ...binding, class_name: 'Generator', property_name: path.includes('property_name=Units') ? 'Units' : 'Max Capacity',
        resolution_contract: 'nohm.modelling.input-snapshot.v1', input_context: { input_date: '2030-01-01T00:00' },
        objects: [{ id: 'g', resolution: { status: 'resolved', value: path.includes('property_name=Units') ? 1 : 400,
          unit: path.includes('property_name=Units') ? '-' : 'MW' } }] }
      : path.includes('/assets?') ? { ...binding, schema: 'nohm.atlas.model-assets.v1', class_name: 'Generator', objects: [obj], classes: [{ class_name: 'Generator', mapped: 1, total: 1 }] }
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], data: [], networks: [] };
    return { ok: true, status: 200, json: async () => data, text: async () => '' };
  });
  try {
    const view = render(<App />); await flush();
    fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
    fireEvent.click(view.getByRole('button', { name: 'Supply map layer' })); await flush();
    expect(mockMapFrames.at(-1).showGenerationMix).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Bubbles & pies' }));
    expect(mockMapFrames.at(-1).showDataBubbles).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Model database', exact: true })); await flush();
    await flush();
    expect(mockMapFrames.at(-1).modelAssetsFrame.maximum).toBe(400);
    expect(mockMapFrames.at(-1).showDataBubbles).toBe(true);
    expect(mockMapFrames.at(-1).showGenerationMix).toBe(false);
    fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
    fireEvent.click(view.getByRole('button', { name: 'Supply map layer' })); await flush();
    expect(mockMapFrames.at(-1).showGenerationMix).toBe(true);
    expect(mockMapFrames.at(-1).modelAssetsFrame).toBeNull();
    const requests = global.fetch.mock.calls.filter(([url]) => String(url).includes('/assets/inputs?')).length;
    fireEvent.click(view.getByRole('button', { name: 'Model database', exact: true })); await flush();
    expect(view.getByRole('combobox', { name: 'Input property' })).toBeTruthy();
    expect(mockMapFrames.at(-1).modelAssetsFrame.maximum).toBe(400);
    expect(global.fetch.mock.calls.filter(([url]) => String(url).includes('/assets/inputs?'))).toHaveLength(requests);
    fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
    fireEvent.click(view.getByRole('button', { name: 'Node markers' }));
    fireEvent.click(view.getByRole('button', { name: 'Bubbles & pies' }));
    fireEvent.click(view.getByRole('button', { name: 'Land', exact: true })); await flush();
    fireEvent.click(view.getByRole('button', { name: 'Back to Map display' })); await flush();
    fireEvent.click(view.getByRole('button', { name: 'Access', exact: true })); await flush();
    fireEvent.click(view.getByRole('button', { name: 'Back to Map display' })); await flush();
    expect(mockMapFrames.at(-1).landConstraints.enabled).toBe(true);
    expect(mockMapFrames.at(-1).gridAccess.enabled).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Reset map display' })); await flush();
    expect(mockMapFrames.at(-1)).toMatchObject({ modelAssetsFrame: null, lolaFlowFrame: null,
      cbaScene: null, showDataBubbles: true, showNodeMarkers: true, showGeographicBoundaries: true,
      generationMarkerScale: 1, resultMarkerScale: 1, presentationMode: false, mapDisplayResetRequest: 1 });
    expect(mockMapFrames.at(-1).landConstraints).toMatchObject({ enabled: false, panelOpen: false, opacity: 68,
      categories: ['protected', 'water', 'urban'], followMapCountries: true });
    expect(mockMapFrames.at(-1).gridAccess).toMatchObject({ enabled: false, panelOpen: false, metric: 'pressure', projectScope: 'future' });
    for (const name of ['Supply', 'Storage', 'Demand']) {
      expect(view.getByRole('button', { name: `${name} map layer` }).getAttribute('aria-pressed')).toBe('false');
    }
    expect(view.getByRole('button', { name: 'Grid map layer' }).getAttribute('aria-pressed')).toBe('true');
    expect(window.__NOHM_ATLAS_WORKSPACE_CONTEXT__).toMatchObject({ projectId: 'Model_A', version: 'v1' });
    expect(window.localStorage.getItem('atlas-map-show-data-bubbles')).toBe('true');
    expect(JSON.parse(window.localStorage.getItem('atlas-land-overlay')).enabled).toBe(false);
    expect(view.getByRole('complementary', { name: 'Map display', exact: true })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Model database', exact: true })); await flush();
    expect(view.getByRole('combobox', { name: 'Input property' })).toBeTruthy();
  } finally {
    cleanup(); global.fetch = originalFetch; window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
    window.localStorage.clear(); jest.useRealTimers();
  }
});

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
    const geographyOptions = Array.from(view.getByRole('combobox', { name: 'Model network geography' }).options);
    expect(geographyOptions.filter(option => !option.disabled).map(option => option.value)).toEqual(['native', 'country', 'regional']);
    expect(geographyOptions.filter(option => ['full', 'nuts3', 'nuts2', 'nuts1', 'ehighway', 'bidding_zone'].includes(option.value))
      .every(option => option.disabled)).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Map display', exact: true }));
    expect(view.getByRole('combobox', { name: 'Network carrier' }).disabled).toBe(true);
    expect(view.getByRole('button', { name: 'Toggle multi-network overlay' }).disabled).toBe(true);
    if (state === 'ready') {
      fireEvent.click(view.getByRole('button', { name: 'Node markers' }));
      expect(mockMapFrames.at(-1).showNodeMarkers).toBe(false);
      fireEvent.click(view.getByRole('button', { name: 'Demand map layer' }));
      await flush();
      expect(mockMapFrames.at(-1).showNodeMarkers).toBe(true);
      expect(view.getByRole('button', { name: 'Demand map layer' }).getAttribute('aria-pressed')).toBe('true');
      await waitFor(() => expect(mockMapFrames.at(-1).facilities.map(node => node.id)).toEqual(['Node:BE00', 'Node:FR00']));
      const facilities = mockMapFrames.at(-1).facilities;
      expect(facilities.map(node => node.id)).toEqual(['Node:BE00', 'Node:FR00']);
      expect(facilities.every(node => node.source_model_project === 'Model_A' && node.source_model_version === 'v1')).toBe(true);
      act(() => mockMapFrames.at(-1).onRenderStatsChange({
        renderedLinks: 1, unmappedLinks: 0, renderingLinks: false, renderError: '',
        mappedLocations: 2, mappedConnections: 1,
      }));
      expect(view.container.textContent).toMatch(/Mapped locations 2/);
      expect(view.container.textContent).toMatch(/Mapped connections 1/);
      expect(view.container.textContent).not.toMatch(/Buses 3/);
      act(() => mockMapFrames.at(-1).onRenderStatsChange({
        renderedLinks: 1, unmappedLinks: 0, renderingLinks: false, renderError: '',
        mappedLocations: 1, mappedConnections: 1,
      }));
      expect(view.container.textContent).toMatch(/Mapped locations 1/);
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
