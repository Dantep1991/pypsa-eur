import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import App from './App';
import { fetchModelResultCatalog, fetchModelResultScene } from './modelWorkspace/resultScene';
import { interpretResultColours } from './modelWorkspace/resultColourPolicy';

let mockMapFrames = [];
jest.mock('./components/EnhancedLeafletMapWithVoice', () => props => {
  mockMapFrames.push(props);
  return <div data-testid="atlas-map" />;
});
jest.mock('./modelWorkspace/resultScene', () => ({
  ...jest.requireActual('./modelWorkspace/resultScene'),
  fetchModelResultCatalog: jest.fn(),
  fetchModelResultScene: jest.fn(),
}));
jest.mock('./modelWorkspace/resultColourPolicy', () => ({
  ...jest.requireActual('./modelWorkspace/resultColourPolicy'),
  interpretResultColours: jest.fn(async scene => scene),
}));

const topology = {
  schema: 'nohm.atlas.model-scene.v1', version: 'v1', carrier: 'electricity', selected_year: 2030,
  layers: ['grid'], nodes: [
    { id: 'Node:BE00', name: 'BE00', country: 'BE', position: { lat: 50.8, lon: 4 } },
    { id: 'Node:FR00', name: 'FR00', country: 'FR', position: { lat: 46.2, lon: 2.2 } },
  ], links: [{ id: 'Line:BE-FR', from_node: 'Node:BE00', to_node: 'Node:FR00' }], assets: [],
  coverage: { counts: { nodes: 2, mapped_nodes: 2, links: 1 }, warnings: [] },
};
const catalogue = projectId => ({
  schema: 'nohm.atlas.result-catalog.v2', project_id: projectId, model_version: 'v1', runs: [{
    run_id: 'native-run', label: 'Native solution', result_model_version: 'v1', compatible: true,
    periods: ['2030'], period_granularity: 'annual', quantities: [
      { id: 'Node.Price', report_family: 'ST', class_name: 'Node', property_name: 'Price', unit: 'EUR/MWh', periods: ['2030'], categories: [] },
      { id: 'Node.Load', report_family: 'ST', class_name: 'Node', property_name: 'Load', unit: 'GWh', periods: ['2030'], categories: [] },
    ],
  }],
});
const resultScene = (context, selection) => ({
  schema: 'nohm.atlas.result-scene.v2', project_id: context.projectId, model_version: 'v1',
  run: { run_id: selection.runId, label: selection.runLabel },
  selection: { id: selection.quantityId, class_name: selection.className, property_name: selection.propertyName,
    map_target: 'node', map_mode: selection.mapMode, period: selection.period, period_label: `Annual ${selection.period}` },
  values: [{ entity_id: 'Node:BE00', value: selection.propertyName === 'Load' ? 200 : 50, unit: selection.unit },
    { entity_id: 'Node:FR00', value: selection.propertyName === 'Load' ? 300 : 70, unit: selection.unit }],
  legend: { minimum: 0, maximum: 300, maximum_magnitude: 300, unit: selection.unit, scale: 'sequential' },
  coverage: { source_row_count: 2 },
});
const flush = () => act(async () => { for (let i = 0; i < 32; i += 1) await Promise.resolve(); });
const originalFetch = global.fetch;
let originalContext;

beforeEach(() => {
  jest.useFakeTimers();
  originalContext = window.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
  window.localStorage.clear();
  mockMapFrames = [];
  fetchModelResultCatalog.mockReset().mockImplementation(async context => catalogue(context.projectId));
  fetchModelResultScene.mockReset().mockImplementation(async (context, selection) => resultScene(context, selection));
  interpretResultColours.mockReset().mockImplementation(async scene => scene);
  global.fetch = jest.fn(async url => {
    if (String(url).includes('/aggregation-catalog?')) {
      return { ok: false, status: 404, json: async () => ({ detail: 'No crosswalk in fixture' }) };
    }
    return { ok: true, status: 200, text: async () => '', json: async () => String(url).includes('/scene?')
      ? { ...topology, project_id: window.__NOHM_ATLAS_WORKSPACE_CONTEXT__.projectId }
      : { success: true, ready: true, status: 'healthy', files: [], countries: [], carriers: [], data: [], networks: [], classes: [], objects: [] } };
  });
});
afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = originalContext;
  window.localStorage.clear();
  jest.useRealTimers();
});

const openResults = async projectId => {
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = { mode: 'model', projectId, version: 'v1' };
  const view = render(<App />);
  await flush();
  const rail = within(view.getByRole('navigation', { name: 'Atlas workspace areas' }));
  fireEvent.click(rail.getByRole('button', { name: 'Visualise', exact: true }));
  fireEvent.click(view.getByRole('button', { name: 'Results', exact: true }));
  await flush();
  return view;
};

test.each(['Joule_Model', 'TYNDP_2026_Scenarios'])('%s shows Results on opening and updates actual map values when quantity changes', async projectId => {
  const view = await openResults(projectId);
  expect(fetchModelResultScene).toHaveBeenCalledTimes(1);
  expect(view.getByRole('complementary', { name: 'Model result legend' })).toHaveTextContent('Node · Price');
  expect(interpretResultColours.mock.calls.at(-1)[0].valueByEntityId.get('Node:BE00')).toMatchObject({ value: 50 });
  expect(mockMapFrames.at(-1).facilities.find(node => node.id === 'Node:BE00')).toMatchObject({ atlas_result_value: 50 });
  fireEvent.change(view.getByRole('combobox', { name: 'Quantity' }), { target: { value: 'Node.Load' } });
  await flush();
  expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
  expect(fetchModelResultScene.mock.calls[1][1]).toMatchObject({ quantityId: 'Node.Load', propertyName: 'Load', modelVersion: 'v1' });
  expect(view.getByRole('complementary', { name: 'Model result legend' })).toHaveTextContent('Node · Load');
  expect(mockMapFrames.at(-1).facilities.find(node => node.id === 'Node:BE00').atlas_result_value).toBe(200);
  expect(view.queryByRole('button', { name: 'Show on map', exact: true })).not.toBeInTheDocument();
  expect(view.getByRole('button', { name: 'Refresh map' })).toBeEnabled();
});

test('a newer selection aborts the pending request and an old response cannot overwrite the map', async () => {
  let resolvePrice;
  fetchModelResultScene.mockImplementationOnce((context, selection) => new Promise(resolve => {
    resolvePrice = () => resolve(resultScene(context, selection));
  }));
  const view = await openResults('Joule_Model');
  const firstSignal = fetchModelResultScene.mock.calls[0][2].signal;
  expect(firstSignal.aborted).toBe(false);
  expect(view.getByRole('combobox', { name: 'Quantity' })).toBeEnabled();
  fireEvent.change(view.getByRole('combobox', { name: 'Quantity' }), { target: { value: 'Node.Load' } });
  await flush();
  expect(firstSignal.aborted).toBe(true);
  expect(view.getByRole('complementary', { name: 'Model result legend' })).toHaveTextContent('Node · Load');
  await act(async () => resolvePrice());
  await flush();
  expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
  expect(view.getByRole('complementary', { name: 'Model result legend' })).toHaveTextContent('Node · Load');
  expect(mockMapFrames.at(-1).facilities.find(node => node.id === 'Node:BE00').atlas_result_value).toBe(200);
});

test('clear cancels loading without auto-reloading and the next selection resumes automatic updates', async () => {
  const view = await openResults('Joule_Model');
  fetchModelResultScene.mockImplementationOnce(() => new Promise(() => {}));
  fireEvent.change(view.getByRole('combobox', { name: 'Quantity' }), { target: { value: 'Node.Load' } });
  await flush();
  const signal = fetchModelResultScene.mock.calls[1][2].signal;
  const panel = within(view.getByRole('complementary', { name: 'Results', exact: true }));
  expect(panel.getByRole('button', { name: 'Clear result layer' })).toBeEnabled();
  fireEvent.click(panel.getByRole('button', { name: 'Clear result layer' }));
  await flush();
  expect(signal.aborted).toBe(true);
  expect(view.queryByRole('complementary', { name: 'Model result legend' })).not.toBeInTheDocument();
  expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
  fireEvent.change(view.getByRole('combobox', { name: 'Quantity' }), { target: { value: 'Node.Price' } });
  await flush();
  expect(fetchModelResultScene).toHaveBeenCalledTimes(3);
  expect(view.getByRole('complementary', { name: 'Model result legend' })).toHaveTextContent('Node · Price');
});

test('a slow live catalogue completes the original agent request without a false unavailable reply',async()=>{
  window.__NOHM_ATLAS_WORKSPACE_CONTEXT__={mode:'model',projectId:'TYNDP_2026_Scenarios',version:'v1'};
  let resolveCatalog;
  fetchModelResultCatalog.mockImplementation(()=>new Promise(resolve=>{resolveCatalog=resolve;}));
  const baseFetch=global.fetch;let plans=0;
  global.fetch=jest.fn(async(url,options={})=>{
    if(String(url).endsWith('/api/map-agent/interpret'))return {ok:true,json:async()=>({confidence:.99,actions:[{intent:'control_workspace',params:{
      workspace:'results',action:plans++===0?'open':'show',binding:'TYNDP_2026_Scenarios:v1',
      ...(plans===1?{continue:true}:{values:{quantityId:'Node.Load'}})}}]})};
    if(String(url).endsWith('/api/map-agent/judge'))return {ok:true,text:async()=>JSON.stringify({confidence:.99,verdict:'pass',corrections:[],summary:'Node Load shown.'})};
    return baseFetch(url,options);
  });
  const view=render(<App/>);await flush();
  fireEvent.click(view.getByRole('button',{name:'Open map assistant'}));
  fireEvent.change(view.getByRole('textbox',{name:'Message EMIL'}),{target:{value:'show node load'}});
  fireEvent.click(view.getByRole('button',{name:'Send assistant message'}));
  for(let i=0;i<6;i++){await flush();act(()=>jest.advanceTimersByTime(100));}
  act(()=>jest.advanceTimersByTime(25000));await flush();
  expect(view.getByRole('log')).not.toHaveTextContent('unavailable');
  await act(async()=>resolveCatalog(catalogue('TYNDP_2026_Scenarios')));
  for(let i=0;i<18;i++){await flush();act(()=>jest.advanceTimersByTime(100));}
  await flush();
  expect(view.getByRole('log')).toHaveTextContent('Load shown');
  expect(view.getByRole('log')).not.toHaveTextContent('still loading');
  const second=global.fetch.mock.calls.filter(([url])=>String(url).endsWith('/api/map-agent/interpret'))[1];
  expect(JSON.parse(second[1].body).mapContext.completedControlPreparations).toHaveLength(1);
  expect(mockMapFrames.at(-1).facilities.find(node=>node.id==='Node:BE00').atlas_result_value).toBe(200);
});

test('verified runs work before unrelated archives finish and background completion preserves the chosen map',async()=>{
  let complete;
  fetchModelResultCatalog.mockImplementation((context,version,options)=>new Promise(resolve=>{
    complete=()=>resolve(catalogue(context.projectId));
    options.onPartialCatalog({...catalogue(context.projectId),pending_runs:[{run_id:'other',label:'Reading archive'}]});
  }));
  const view=await openResults('TYNDP_2026_Scenarios');
  expect(view.getByRole('combobox',{name:'Quantity'})).toBeEnabled();
  expect(view.getByText(/Loaded runs are available/)).toBeInTheDocument();
  fireEvent.change(view.getByRole('combobox',{name:'Quantity'}),{target:{value:'Node.Load'}});await flush();
  await act(async()=>complete());await flush();
  expect(view.getByRole('combobox',{name:'Quantity'})).toHaveValue('Node.Load');
  expect(mockMapFrames.at(-1).facilities.find(node=>node.id==='Node:BE00').atlas_result_value).toBe(200);
  expect(fetchModelResultScene).toHaveBeenCalledTimes(2);
});
