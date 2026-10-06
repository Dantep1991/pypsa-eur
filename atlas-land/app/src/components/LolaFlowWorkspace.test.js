import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import LolaFlowWorkspace from './LolaFlowWorkspace';
import { fetchModelResultCatalog } from '../modelWorkspace/resultScene';
import { fetchLolaFlowScene, fetchLolaFlowTopology } from '../modelWorkspace/lolaFlowData';
import {fetchFlowYear} from '../modelWorkspace/flowHistory';
import {fetchFlowHistory} from '../modelWorkspace/flowHistoryView';
import {RESULT_SERIES_COLORS} from '../modelWorkspace/resultColors';
import {createWorkspaceRegistry} from '../agentWorkspace/registry';
import {WorkspaceAgentProvider} from '../agentWorkspace/react';

const capacityToggle=()=>within(document.getElementById('flow-panel-capacity')).getByLabelText('Near capacity',{exact:true});
const historyToggle=()=>within(screen.getByRole('region',{name:'Connection history'})).getByLabelText('Near capacity',{exact:true});

jest.mock('../modelWorkspace/resultScene', () => ({ fetchModelResultCatalog: jest.fn() }));
jest.mock('../modelWorkspace/flowHistory',()=>({...jest.requireActual('../modelWorkspace/flowHistory'),fetchFlowYear:jest.fn(()=>new Promise(()=>{}))}));
jest.mock('../modelWorkspace/flowHistoryView',()=>({...jest.requireActual('../modelWorkspace/flowHistoryView'),fetchFlowHistory:jest.fn(()=>new Promise(()=>{}))}));
jest.mock('../modelWorkspace/lolaFlowData', () => ({
  ...jest.requireActual('../modelWorkspace/lolaFlowData'), fetchLolaFlowScene: jest.fn(), fetchLolaFlowTopology: jest.fn(),
}));

const context = { mode: 'model', projectId: 'Example' };
const catalog = { runs: [{ run_id: 'run', compatible: true, result_model_version: 'v1', label: 'Baseline', periods: ['2050'], quantities: [
  { id: 'Line.Flow', class_name: 'Line', property_name: 'Flow', report_family: 'ST', unit: 'GWh', available_granularities: ['year'], periods: ['2050'] },
  { id: 'Gas Pipeline.Flow In', class_name: 'Gas Pipeline', property_name: 'Flow In', report_family: 'ST', unit: 'GWh', available_granularities: ['year'], periods: ['2050'] },
] }] };
const scene = { periods: ['2050-01-01'], unit: 'GWh', direction: 1, maximum: 12,
  selection: { className: 'Line', propertyName: 'Flow', granularity: 'year' },
  coverage: { mapped: 1, matched: 1, unmapped: 0, unmatched: 0 },
  lines: [{ id: 'Line:Exact', name: 'Exact', from_node: 'A', to_node: 'B', category: 'Native',
    coordinates: [[1, 2], [3, 4]], values: new Map([['2050-01-01', 12]]) }],
};
let props;
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext=jest.fn(()=>null);
  jest.clearAllMocks(); fetchModelResultCatalog.mockReset().mockResolvedValue(catalog); fetchLolaFlowScene.mockReset().mockResolvedValue(scene);
  fetchFlowYear.mockImplementation(()=>new Promise(()=>{}));
  fetchFlowHistory.mockReset().mockImplementation(()=>new Promise(()=>{}));
  fetchLolaFlowTopology.mockResolvedValue({ lines: [{ category: 'Native' }] });
  props = { context, modelVersion: 'v1', selectedId: '', onSelect: jest.fn(), onFrame: jest.fn(), onClose: jest.fn() };
});

test('the agent can request stopped playback while loading its first flows', async () => {
  const registry = createWorkspaceRegistry();
  registry.bind('Example:v1', {});
  render(<WorkspaceAgentProvider value={registry}><LolaFlowWorkspace {...props} /></WorkspaceAgentProvider>);
  await waitFor(() => expect(registry.controllers.get('flow')?.ready).toBe(true));
  let done = false, failure, reply;
  act(() => { registry.controllers.get('flow').execute('show', { playing: false }).then(
    value => { reply = value; done = true; }, error => { failure = error; done = true; }); });
  for (let index = 0; !done && index < 100; index++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  expect(failure).toBeUndefined();
  expect(done).toBe(true);
  expect(reply).toBe('1 connections shown.');
  expect(registry.controllers.get('flow').state.playing).toBe(false);
});

test('flow reload preserves an existing selected connection', async () => {
  render(<LolaFlowWorkspace {...props} selectedId={scene.lines[0].id} />);
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByRole('region', { name: 'Connection history' });
  expect(props.onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(() => expect(fetchLolaFlowScene).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  expect(props.onSelect).not.toHaveBeenCalled();
});

test('flow reload preserves its current reported time period', async () => {
  const periods = ['2050-01-01T00:00:00Z', '2050-01-01T01:00:00Z'];
  fetchLolaFlowScene.mockResolvedValue({ ...scene, periods,
    selection: { ...scene.selection, granularity: 'hour' } });
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByRole('region', { name: 'Connection history' });
  fireEvent.change(screen.getByLabelText('Flow period'), { target: { value: '1' } });
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(() => expect(fetchLolaFlowScene).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  expect(screen.getByLabelText('Flow period')).toHaveValue('1');
});

test('flow reload clears a connection not present in the selected run', async () => {
  render(<LolaFlowWorkspace {...props} selectedId="Line:not-in-this-run" />);
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByRole('region', { name: 'Connection history' });
  expect(props.onSelect).toHaveBeenLastCalledWith('');
});

test('shared catalogue is reused after closing/reopening, with no second discovery', async () => {
  const shared = { state: 'ready', catalog: { ...catalog, project_id: 'Example', model_version: 'v1' } };
  const view = render(<LolaFlowWorkspace {...props} catalogStatus={shared} />);
  expect(screen.queryByText(/Reading result catalogues/)).toBeNull();
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  expect(fetchModelResultCatalog).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: 'Grid flow workspace' })).toBeInTheDocument();
  view.unmount();
  render(<LolaFlowWorkspace {...props} catalogStatus={shared} />);
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  expect(fetchModelResultCatalog).not.toHaveBeenCalled();
});

test('workspace and History animation toggles control the same frame setting', async () => {
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByRole('region', { name: 'Connection history' });
  expect(screen.getByLabelText('Animate chart transfers')).toBeChecked();
  fireEvent.click(screen.getByLabelText('Animate chart transfers'));
  expect(screen.getByLabelText('Animate direction')).not.toBeChecked();
  expect(props.onFrame.mock.calls.at(-1)[0].animated).toBe(false);
  fireEvent.click(screen.getByLabelText('Animate direction'));
  expect(screen.getByLabelText('Animate chart transfers')).toBeChecked();
  expect(props.onFrame.mock.calls.at(-1)[0].animated).toBe(true);
});

test('speed changes map and History motion without requerying, changing values or playing the timeline', async () => {
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).toBeEnabled());
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByRole('region', { name: 'Connection history' });
  const speed = screen.getByRole('slider', { name: 'Flow animation speed' });
  expect(speed).toHaveValue('1');
  expect(speed).toHaveAttribute('min', '0.25');
  expect(speed).toHaveAttribute('max', '3');
  fireEvent.change(speed, { target: { value: '.25' } });
  expect(props.onFrame.mock.calls.at(-1)[0]).toMatchObject({ animationSpeed: .25, animated: true });
  expect(props.onFrame.mock.calls.at(-1)[0].lines[0].value).toBe(12);
  fireEvent.change(speed, { target: { value: '3' } });
  expect(screen.getByLabelText('Flow animation speed value')).toHaveTextContent('3×');
  expect(props.onFrame.mock.calls.at(-1)[0].animationSpeed).toBe(3);
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(1);
  expect(fetchFlowHistory).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  fireEvent.click(screen.getByLabelText('Animate chart transfers'));
  expect(speed).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Animate direction'));
  expect(speed).toBeEnabled();
  expect(speed).toHaveValue('3');
  expect(props.onFrame.mock.calls.at(-1)[0]).toMatchObject({ animationSpeed: 3, animated: true });
});

test.each(['day','week','month'])('History and map navigation preserve the loaded %s contract',async granularity=>{
  const flow={...catalog.runs[0].quantities[0],available_granularities:['hour','day','week','month','year'],
    units_by_granularity:{hour:'MW',day:'GWh',week:'GWh',month:'GWh',year:'GWh'}};
  fetchModelResultCatalog.mockResolvedValue({runs:[{...catalog.runs[0],quantities:[flow]}]});
  const period=granularity==='week'?'2049-12-27':'2050-01-01';
  fetchLolaFlowScene.mockImplementation(async(_context,selection)=>({...scene,selection,periods:[period],
    lines:[{...scene.lines[0],values:new Map([[period,12]])}]}));
  fetchFlowHistory.mockImplementation(async(_context,source)=>source);
  render(<LolaFlowWorkspace {...props}/>);
  await waitFor(()=>expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Flow time resolution'),{target:{value:granularity}});
  await waitFor(()=>expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(()=>expect(screen.getByText('Show period on map')).toBeEnabled());
  expect(screen.getByLabelText('History resolution')).toHaveTextContent(`${{day:'Daily',week:'Weekly',month:'Monthly'}[granularity]} · Flow · GWh`);
  fireEvent.click(screen.getByText('Show period on map'));
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(1); // Already loaded: no re-read.
  expect(screen.getByLabelText('Flow time resolution').value).toBe(granularity);
});

test('annual-only runs expose no fabricated hourly options or capacity congestion', async () => {
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  expect(screen.getByLabelText('Flow time resolution').options).toHaveLength(1);
  expect(screen.getByLabelText('Flow time resolution').value).toBe('year');
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByText(/1 mapped/);
  expect(screen.queryByRole('button',{name:'Play timeline'})).toBeNull();
  expect(capacityToggle()).toBeDisabled();
  expect(historyToggle()).toBeDisabled();
  expect(screen.queryByText('Near declared limit')).toBeNull();
  expect(screen.getByRole('img', { name: /Parallel flow history/ })).toBeInTheDocument();
  await waitFor(() => expect(props.onFrame.mock.calls.at(-1)[0]?.lines[0].value).toBe(12));
});

test('Gas Pipeline uses the same query and retains unmapped actual history', async () => {
  fetchLolaFlowScene.mockResolvedValue({ ...scene, selection: { ...scene.selection, className: 'Gas Pipeline', propertyName: 'Flow In' },
    lines: [{ ...scene.lines[0], coordinates: [] }], coverage: { ...scene.coverage, mapped: 0, unmapped: 1 } });
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Flow quantity'), { target: { value: 'Gas Pipeline.Flow In' } });
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows'));
  fireEvent.click(screen.getByRole('tab',{name:'Data'}));
  await screen.findByText(/No native endpoint coordinates/);
  expect(fetchLolaFlowScene.mock.calls[0][1].className).toBe('Gas Pipeline');
  expect(screen.getByRole('img')).toBeInTheDocument();
  await waitFor(() => expect(props.onFrame.mock.calls.at(-1)[0]?.lines).toHaveLength(0));
});

test('failed refresh keeps the last committed view and reports real loading phases', async () => {
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows')); await screen.findByText(/1 mapped/);
  let reject;
  fetchLolaFlowScene.mockImplementation((_context, _selection, options) => {
    options.onProgress({ phase: 'query', completed: 1, total: 3 });
    return new Promise((_resolve, fail) => { reject = fail; });
  });
  fireEvent.click(screen.getByText('Load flows'));
  expect(screen.getByText(/Loading query/)).toHaveTextContent('1/3');
  expect(screen.getByRole('img')).toBeInTheDocument();
  await act(async () => reject(new Error('Unavailable')));
  expect(screen.getByRole('alert')).toHaveTextContent('previous flow view remains visible');
  expect(props.onFrame.mock.calls.at(-1)[0].lines[0].value).toBe(12);
});

test('closing cancels an outstanding query and selection/animation do not requery', async () => {
  const view = render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows')); await screen.findByText(/1 mapped/);
  fireEvent.click(screen.getByLabelText('Animate direction'));
  expect(props.onFrame.mock.calls.at(-1)[0].animated).toBe(false);
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(1);
  fetchLolaFlowScene.mockImplementation(() => new Promise(() => {}));
  fireEvent.click(screen.getByText('Load flows'));
  const signal = fetchLolaFlowScene.mock.calls[1][2].signal;
  view.unmount(); expect(signal.aborted).toBe(true);
});

test('timeline and map selection change frames locally, preserving sparse reported dates', async () => {
  fetchLolaFlowScene.mockResolvedValue({ ...scene, periods: ['2052-02-29', '2052-03-02'],
    lines: [{ ...scene.lines[0], values: new Map([['2052-02-29', 12], ['2052-03-02', -5]]) }] });
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(() => expect(screen.getByLabelText('Flow period')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Flow period'), { target: { value: '1' } });
  expect(props.onFrame.mock.calls.at(-1)[0].lines[0].actualFrom).toBe('B');
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(1);
});

test('model category is an explicit pre-query scope and tabs separate settings after load', async () => {
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Flow model category'), { target: { value: 'Native' } });
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByText(/1 mapped/);
  expect(fetchLolaFlowScene.mock.calls[0][1].category).toBe('Native');
  expect(screen.getByLabelText('Flow quantity')).not.toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
  expect(screen.getByLabelText('Flow quantity')).toBeVisible();
});

test('Near capacity is one shared bidirectional setting for map and History, with one threshold and no requery',async()=>{
  const first={...scene.lines[0],values:new Map([['2050-01-01',867.24]]),
    reportedLimits:new Map([['2050-01-01',{unit:'MW',forward:100,reverse:100}]])};
  const second={...first,id:'Line:Other',name:'Other',values:new Map([['2050-01-01',87.6]])};
  fetchLolaFlowScene.mockImplementation(async(_context,selection)=>({...scene,selection,maximum:867.24,
    lines:[first,second],coverage:{mapped:2,matched:2,unmapped:0,unmatched:0}}));
  const view=render(<LolaFlowWorkspace {...props}/>);
  await waitFor(()=>expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(()=>expect(historyToggle()).toBeEnabled());
  expect(capacityToggle()).not.toBeChecked();
  expect(historyToggle()).not.toBeChecked();
  expect(screen.queryByText('Near declared limit')).toBeNull();

  fireEvent.click(historyToggle());
  expect(capacityToggle()).toBeChecked();
  expect(historyToggle()).toBeChecked();
  expect(props.onFrame.mock.calls.at(-1)[0].lines.map(line=>line.color)).toEqual([RESULT_SERIES_COLORS[2],RESULT_SERIES_COLORS[0]]);
  fireEvent.click(screen.getByRole('tab',{name:'Capacity'}));
  fireEvent.click(capacityToggle());
  expect(historyToggle()).not.toBeChecked();
  expect(props.onFrame.mock.calls.at(-1)[0].lines.every(line=>line.color===RESULT_SERIES_COLORS[0])).toBe(true);

  fireEvent.click(capacityToggle());
  fireEvent.change(screen.getByLabelText('Near capacity utilisation (%)'),{target:{value:'100'}});
  expect(historyToggle()).toBeChecked();
  expect(props.onFrame.mock.calls.at(-1)[0].lines[0].color).toBe(RESULT_SERIES_COLORS[0]);
  fireEvent.change(screen.getByLabelText('Near capacity utilisation (%)'),{target:{value:'99'}});
  expect(props.onFrame.mock.calls.at(-1)[0].lines[0].color).toBe(RESULT_SERIES_COLORS[2]);
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(1);
  expect(fetchFlowHistory).not.toHaveBeenCalled();

  view.rerender(<LolaFlowWorkspace {...props} selectedId="Line:Other"/>);
  expect(historyToggle()).toBeChecked();
  expect(capacityToggle()).toBeChecked();
  fireEvent.click(historyToggle());
  expect(capacityToggle()).not.toBeChecked();
  fireEvent.click(historyToggle());
  fireEvent.click(screen.getByRole('tab',{name:'Time & display'}));
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(()=>expect(fetchLolaFlowScene).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect(historyToggle()).toBeChecked());
  expect(capacityToggle()).toBeChecked();
});

const quality = { schema: 'nohm.results.quality.v1', policy: 'reject', conflicted_entity_count: 1,
  excluded_entity_count: 0, source_data_changed: false, conflicts: [{ run_id: 'run', entity_name: 'Disputed',
    periods: [{ timestamp: '2050-01-01', unit: 'GWh', observations: [{ value: 10, source_file: 'systemlines.csv' }, { value: 20, source_file: 'systemlines.csv' }] }] }] };

test('native hourly defaults to one day, Daily remains available, and uses period-specific units', async () => {
  fetchModelResultCatalog.mockResolvedValue({ runs: [{ ...catalog.runs[0], quantities: [
    { ...catalog.runs[0].quantities[0], available_granularities: ['year','day','hour'], units_by_granularity: { hour: 'MW',day: 'GWh' } },
    { id:'Line.Export Limit',class_name:'Line',property_name:'Export Limit',available_granularities:['hour','day'] },
  ] }] });
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  expect(screen.getByLabelText('Flow time resolution').value).toBe('hour');
  expect(screen.getByLabelText('Flow end date').value).toBe('2050-01-01');
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByText(/1 mapped/);
  expect(fetchLolaFlowScene.mock.calls[0][1]).toMatchObject({unit:'MW',limitProperties:['Export Limit'],dateTo:'2050-01-01'});
  expect(props.onSelect).toHaveBeenLastCalledWith(''); // never dim all other lines on initial load
  expect(screen.getByRole('tab', {name:'Time & display'})).toHaveAttribute('aria-selected','true');
  expect(capacityToggle()).not.toBeVisible();
  fireEvent.click(screen.getByRole('tab',{name:'Capacity'}));
  expect(capacityToggle()).toBeVisible();
  expect(screen.getByLabelText('Near capacity utilisation (%)')).toBeVisible();
  expect(screen.getByLabelText('Animate direction')).not.toBeVisible();
  fireEvent.click(screen.getByRole('tab',{name:'Time & display'}));
  fireEvent.change(screen.getByLabelText('Flow time resolution'),{target:{value:'day'}});
  expect(screen.getByLabelText('Flow end date').value).toBe('2050-01-01');
  await waitFor(()=>expect(fetchLolaFlowScene).toHaveBeenCalledTimes(2));
});

test('valid-record retry requires an explicit click, reports exclusions and is not sticky', async () => {
  fetchLolaFlowScene.mockRejectedValueOnce(Object.assign(new Error('Conflicting observations'), { code: 'result_observation_conflict', quality }));
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByText('Show valid records');
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Disputed')).toBeInTheDocument();
  fetchLolaFlowScene.mockResolvedValueOnce({ ...scene, quality: { ...quality, policy: 'exclude_entities', excluded_entity_count: 1 } });
  fireEvent.click(screen.getByText('Show valid records'));
  await waitFor(()=>expect(screen.getByRole('tab',{name:'Time & display'})).toHaveAttribute('aria-selected','true'));
  fireEvent.click(screen.getByRole('tab',{name:'Data'}));
  await screen.findByText('Review excluded records');
  expect(fetchLolaFlowScene.mock.calls[1][2].conflictPolicy).toBe('exclude_entities');
  expect(fetchLolaFlowScene.mock.calls[1][1]).toEqual(fetchLolaFlowScene.mock.calls[0][1]);
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(() => expect(fetchLolaFlowScene).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  expect(fetchLolaFlowScene.mock.calls[2][2].conflictPolicy).toBe('reject');
});

test('changing scope clears the old approval action and previous displayed scope is labeled', async () => {
  fetchLolaFlowScene.mockResolvedValueOnce({ ...scene, selection: { ...scene.selection, category: 'Old category' } });
  render(<LolaFlowWorkspace {...props} />);
  await waitFor(() => expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows')); await screen.findByText(/1 mapped/);
  fetchLolaFlowScene.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { code: 'result_observation_conflict', quality }));
  fireEvent.click(screen.getByRole('tab', { name: 'Data' }));
  fireEvent.change(screen.getByLabelText('Flow model category'), { target: { value: 'Native' } });
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByText('Show valid records');
  expect(screen.getByRole('alert')).toHaveTextContent(/Still displaying:.*Old category/);
  fireEvent.change(screen.getByLabelText('Flow model category'), { target: { value: '' } });
  await waitFor(() => expect(screen.queryByText('Show valid records')).toBeNull());
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(2);
});

test.each([false,true])('Annual selects %s native-net availability, enables limits and preserves Hourly navigation', async native => {
  const flow={...catalog.runs[0].quantities[0],available_granularities:['hour','day','year'],units_by_granularity:{hour:'MW',day:'GWh',year:'GWh'}};
  fetchModelResultCatalog.mockResolvedValue({runs:[{...catalog.runs[0],quantities:[flow,
    {...flow,id:'Line.Flow Back',property_name:'Flow Back'},
    ...(native?[{...flow,id:'Line.Net Flow',property_name:'Net Flow',available_granularities:['day','year']}]:[]),
    {...flow,id:'Line.Export Limit',property_name:'Export Limit'},
    {...flow,id:'Line.Import Limit',property_name:'Import Limit'},
  ]}]});
  fetchLolaFlowScene.mockImplementation(async(_context,selection)=>({...scene,selection,
    lines:[{...scene.lines[0],values:new Map([['2050-01-01',-433.62]]),
      reportedLimits:new Map([['2050-01-01',{unit:'MW',forward:100,reverse:50}]])}]}));
  render(<LolaFlowWorkspace {...props}/>);
  await waitFor(()=>expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Flow time resolution'),{target:{value:'year'}});
  expect(screen.getByLabelText('Flow quantity').value).toBe(native?'Line.Net Flow':'Line.Annual Net Flow');
  await waitFor(()=>expect(screen.getByText('Load flows')).not.toBeDisabled());
  fireEvent.click(screen.getByText('Load flows'));
  await screen.findByText(/annual net utilisation/);
  expect(fetchLolaFlowScene.mock.calls[0][1]).toMatchObject({propertyName:'Net Flow',derivedNetFlow:!native,
    granularity:'year',unit:'GWh',dateFrom:'2050-01-01',dateTo:'2050-12-31',limitProperties:['Export Limit','Import Limit']});
  expect(screen.getByLabelText('Animate direction')).toBeEnabled();
  expect(capacityToggle()).not.toBeVisible();
  expect(screen.getByText(/annual net utilisation/)).not.toBeVisible();
  fireEvent.click(screen.getByRole('tab',{name:'Capacity'}));
  expect(capacityToggle()).toBeEnabled();
  expect(capacityToggle()).toBeVisible();
  expect(screen.getByText(/annual net utilisation/)).toBeVisible();
  expect(screen.getByLabelText('Annual connection metrics')).toHaveTextContent('Net-equivalent 8,672 full-load hours · 99.0% annual utilisation');
  fireEvent.click(capacityToggle());
  expect(historyToggle()).toBeChecked();
  expect(props.onFrame.mock.calls.at(-1)[0].lines[0]).toMatchObject({actualFrom:'B',metrics:{utilisation:.99},annual:true,net:true});
  fireEvent.click(screen.getByRole('tab',{name:'Time & display'}));
  expect(capacityToggle()).not.toBeVisible();
  expect(capacityToggle()).toBeChecked();
  fireEvent.change(screen.getByLabelText('Flow time resolution'),{target:{value:'hour'}});
  await waitFor(()=>expect(screen.getByText('Load flows')).not.toBeDisabled());
  await waitFor(()=>expect(fetchLolaFlowScene).toHaveBeenCalledTimes(2));
  expect(fetchLolaFlowScene.mock.calls[1][1]).toMatchObject({propertyName:'Flow',granularity:'hour',unit:'MW',derivedNetFlow:false});
});

test('map cursor, history inspect and playback share one period; both resolution controls reload the native quantity', async () => {
  const flow={...catalog.runs[0].quantities[0],available_granularities:['hour','day'],
    units_by_granularity:{hour:'MW',day:'GWh'}};
  fetchModelResultCatalog.mockResolvedValue({runs:[{...catalog.runs[0],quantities:[flow]}]});
  const periods=['2050-01-01T00:00:00Z','2050-01-01T01:00:00Z','2050-01-01T02:00:00Z'];
  fetchLolaFlowScene.mockImplementation(async(_context,selection)=>({...scene,selection,
    periods:selection.granularity==='hour'?periods:['2050-01-01','2050-01-02'],unit:selection.unit,
    lines:[{...scene.lines[0],values:new Map(periods.map((p,i)=>[p,i+1]))}]}));
  fetchFlowHistory.mockImplementation(async(_context,source)=>source);
  render(<LolaFlowWorkspace {...props}/>);
  await waitFor(()=>expect(screen.getByText('Load flows')).toBeEnabled());
  fireEvent.click(screen.getByText('Load flows'));
  await waitFor(()=>expect(screen.getByLabelText('History inspected period')).toHaveAttribute('max','8759'));
  fireEvent.change(screen.getByLabelText('Flow period'),{target:{value:'2'}});
  expect(screen.getByLabelText('History inspected period')).toHaveValue('2');
  fireEvent.change(screen.getByLabelText('History inspected period'),{target:{value:'1'}});
  expect(screen.getByLabelText('Flow period')).toHaveValue('1');
  expect(props.onFrame.mock.calls.at(-1)[0].period).toBe(periods[1]);
  expect(fetchLolaFlowScene).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Play timeline'));
  await waitFor(()=>expect(screen.getByLabelText('Flow period')).toHaveValue('2'),{timeout:1500});
  expect(screen.getByLabelText('History inspected period')).toHaveValue('2');
  fireEvent.click(screen.getByText('Pause'));
  fireEvent.change(screen.getByLabelText('History aggregation'),{target:{value:'day'}});
  await waitFor(()=>expect(fetchLolaFlowScene).toHaveBeenCalledTimes(2));
  expect(fetchLolaFlowScene.mock.calls[1][1]).toMatchObject({granularity:'day',unit:'GWh',dateFrom:'2050-01-01',dateTo:'2050-01-01'});
  expect(screen.getByLabelText('Flow time resolution')).toHaveValue('day');
  await waitFor(()=>expect(screen.getByLabelText('History aggregation')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Flow time resolution'),{target:{value:'hour'}});
  await waitFor(()=>expect(fetchLolaFlowScene).toHaveBeenCalledTimes(3));
  expect(screen.getByLabelText('History aggregation')).toHaveValue('hour');
});
