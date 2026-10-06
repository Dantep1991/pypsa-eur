import React from 'react';
import '@testing-library/jest-dom';
import {act,render,screen,waitFor,fireEvent} from '@testing-library/react';
import {WorkspaceAgentProvider} from '../agentWorkspace/react';
import {createWorkspaceRegistry} from '../agentWorkspace/registry';
import LolaFlowWorkspace from './LolaFlowWorkspace';
import LolaCapacityEvidence from './LolaCapacityEvidence';
import LolaFlowHistoryDock from './LolaFlowHistoryDock';
import {fetchModelResultCatalog} from '../modelWorkspace/resultScene';
import {fetchLolaFlowScene,fetchLolaFlowTopology} from '../modelWorkspace/lolaFlowData';
import {fetchFlowYear} from '../modelWorkspace/flowHistory';
import {fetchFlowHistory} from '../modelWorkspace/flowHistoryView';
jest.mock('../modelWorkspace/resultScene',()=>({fetchModelResultCatalog:jest.fn()}));
jest.mock('../modelWorkspace/lolaFlowData',()=>({...jest.requireActual('../modelWorkspace/lolaFlowData'),fetchLolaFlowScene:jest.fn(),fetchLolaFlowTopology:jest.fn()}));
jest.mock('../modelWorkspace/flowHistory',()=>({...jest.requireActual('../modelWorkspace/flowHistory'),fetchFlowYear:jest.fn()}));
jest.mock('../modelWorkspace/flowHistoryView',()=>({...jest.requireActual('../modelWorkspace/flowHistoryView'),fetchFlowHistory:jest.fn()}));
const flow={id:'Line.Flow',class_name:'Line',property_name:'Flow',report_family:'ST',unit:'GWh',
  available_granularities:['hour','day','year'],periods:['2050'],units_by_granularity:{hour:'MW',day:'GWh',year:'GWh'}};
const catalog={runs:[{run_id:'r',compatible:true,label:'Run',result_model_version:'v1',periods:['2050'],quantities:[flow,
  {...flow,id:'Line.Flow Back',property_name:'Flow Back'}]}]};
const periods=['2050-01-01T00:00:00'];
const base={selection:{modelVersion:'v1',runId:'r',className:'Line',propertyName:'Flow',period:'2050',granularity:'hour',historyMetric:{availableGranularities:['hour']}},
  periods,unit:'MW',direction:1,maximum:50,coverage:{mapped:1,matched:1,unmapped:0,unmatched:0},
  lines:[{id:'a',name:'A - B',from_node:'A',to_node:'B',coordinates:[[1,2],[3,4]],category:'AC',
    values:new Map([[periods[0],50]]),reportedLimits:new Map([[periods[0],{unit:'MW',forward:100,reverse:100}]])}]};
let registry;
const mount=element=>render(<WorkspaceAgentProvider value={registry}>{element}</WorkspaceAgentProvider>);
const exec=async(id,action,values={})=>{
  let reply,failure,done=false;
  act(()=>{registry.controllers.get(id).execute(action,values).then(value=>{reply=value;done=true;},error=>{failure=error;done=true;});});
  for(let attempt=0;!done&&attempt<120;attempt++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,25));});
  if(failure)throw failure;
  if(!done)throw new Error('Agent control did not settle against the committed UI.');
  return reply;
};
beforeEach(()=>{
  jest.clearAllMocks();HTMLCanvasElement.prototype.getContext=jest.fn(()=>null);
  registry=createWorkspaceRegistry();registry.bind('Test:v1',{});
  fetchModelResultCatalog.mockResolvedValue(catalog);
  fetchLolaFlowTopology.mockResolvedValue({lines:[{category:'AC'}],default_category:'AC'});
  fetchLolaFlowScene.mockImplementation(async(_,selection)=>({...base,selection}));
  fetchFlowYear.mockImplementation(()=>new Promise(()=>{}));
  fetchFlowHistory.mockImplementation(()=>new Promise(()=>{}));
});
const workspace=()=>mount(<LolaFlowWorkspace context={{projectId:'Test'}} modelVersion="v1" onSelect={jest.fn()} onFrame={jest.fn()} onClose={jest.fn()}/>);
test('agent annual Line.Flow uses the canonical Net Flow and resets an old hourly window',async()=>{
  workspace();await waitFor(()=>expect(registry.controllers.get('flow')?.ready).toBe(true));
  await exec('flow','configure',{dateFrom:'2050-06-01',dateTo:'2050-06-02'});
  const result=await exec('flow','show',{quantityId:'Line.Flow',granularity:'year',animated:false,tab:'capacity'});
  expect(result).toBe('1 connections shown.');
  expect(fetchLolaFlowScene.mock.calls.at(-1)[1]).toMatchObject({propertyName:'Net Flow',granularity:'year',dateFrom:'2050-01-01',dateTo:'2050-12-31'});
  expect(registry.controllers.get('flow').state).toMatchObject({tab:'capacity',animated:false});
});
test('agent loads before checking newly requested near-capacity highlighting',async()=>{
  workspace();await waitFor(()=>expect(registry.controllers.get('flow')?.ready).toBe(true));
  await exec('flow','show',{granularity:'hour',nearCapacity:true});
  expect(registry.controllers.get('flow').state.nearCapacity).toBe(true);
});
test('quantity-specific unsupported resolutions fail before reading data',async()=>{
  workspace();await waitFor(()=>expect(registry.controllers.get('flow')?.ready).toBe(true));
  await expect(exec('flow','show',{granularity:'month'})).rejects.toThrow('not reported');
  expect(fetchLolaFlowScene).not.toHaveBeenCalled();
});
test('capacity calculation reports pending progress and can be cancelled through the same button path',async()=>{
  const onEvidence=jest.fn();mount(<LolaCapacityEvidence projectId="Test" scene={base} onEvidence={onEvidence}/>);
  expect(await exec('flow_capacity','calculate')).toMatch(/Calculating/);
  expect(registry.controllers.get('flow_capacity').state.status).toBe('loading');
  expect(registry.controllers.get('flow_capacity').state.evidence).toBe(false);
  const signal=fetchFlowYear.mock.calls[0][3].signal;
  await exec('flow_capacity','cancel');expect(signal.aborted).toBe(true);
  expect(registry.controllers.get('flow_capacity').state.status).toBe('cancelled');
  expect(onEvidence).toHaveBeenLastCalledWith(null);
});
test('completed capacity evidence changes threshold and reuses cached calculation',async()=>{
  fetchFlowYear.mockResolvedValue({stats:new Map([['a',{share:.5,nearHours:50,validHours:100,reportedHours:100,expectedHours:100}]]),warnings:[]});
  const onEvidence=jest.fn();mount(<LolaCapacityEvidence projectId="Test" scene={base} onEvidence={onEvidence}/>);
  await exec('flow_capacity','calculate');await waitFor(()=>expect(registry.controllers.get('flow_capacity').state.evidence).toBe(true));
  await exec('flow_capacity','configure',{threshold:60,enabled:false});
  expect(registry.controllers.get('flow_capacity').state).toMatchObject({threshold:60,highlighted:0,enabled:false});
  expect(await exec('flow_capacity','calculate')).toMatch(/Cached/);
  expect(fetchFlowYear).toHaveBeenCalledTimes(1);expect(onEvidence.mock.calls.at(-1)[0].threshold).toBe(.6);
});
test('capacity colours cannot be enabled without calculated evidence',async()=>{
  mount(<LolaCapacityEvidence projectId="Test" scene={base} onEvidence={jest.fn()}/>);
  await expect(exec('flow_capacity','configure',{enabled:true})).rejects.toThrow('Calculate capacity hours');
});
test('history cancellation aborts the read; retry is available without waiting for the cancelled history',async()=>{
  mount(<LolaFlowHistoryDock context={{projectId:'Test'}} scene={base} line={base.lines[0]}/>);
  const signal=fetchFlowHistory.mock.calls[0][3].signal;
  await exec('flow_history','cancel');expect(signal.aborted).toBe(true);
  await exec('flow_history','retry');expect(fetchFlowHistory).toHaveBeenCalledTimes(2);
});
test('history aggregation, inspect and collapse operate the real chart without rereading results',async()=>{
  fetchFlowHistory.mockResolvedValue({...base,periods:Array.from({length:48},(_,i)=>`2050-01-${i<24?'01':'02'}T${String(i%24).padStart(2,'0')}:00:00`),
    lines:[{...base.lines[0],values:new Map(Array.from({length:48},(_,i)=>[`2050-01-${i<24?'01':'02'}T${String(i%24).padStart(2,'0')}:00:00`,i]))}]});
  mount(<LolaFlowHistoryDock context={{projectId:'Test'}} scene={base} line={base.lines[0]} onChoosePeriod={jest.fn()}/>);
  await waitFor(()=>expect(registry.controllers.get('flow_history').state.loaded).toBe(true));
  await exec('flow_history','configure',{resolution:'day'});
  expect(screen.getByLabelText('History aggregation')).toHaveValue('day');
  expect(registry.controllers.get('flow_chart').state.visiblePeriods).toBe(365); // Missing days remain explicit, not removed.
  await exec('flow_chart','configure',{inspect:1});expect(registry.controllers.get('flow_chart').state.period).toContain('2050-01-02');
  await exec('flow_history','configure',{collapsed:true});expect(screen.getByText('Expand history')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Expand history'));expect(registry.controllers.get('flow_history').state.collapsed).toBe(false);
  expect(fetchFlowHistory).toHaveBeenCalledTimes(1);
});
