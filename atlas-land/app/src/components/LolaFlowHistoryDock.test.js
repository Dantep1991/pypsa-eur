import React from 'react';
import '@testing-library/jest-dom';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import LolaFlowHistoryDock from './LolaFlowHistoryDock';
import {fetchFlowYear} from '../modelWorkspace/flowHistory';
import {fetchFlowHistory} from '../modelWorkspace/flowHistoryView';
jest.mock('../modelWorkspace/flowHistory',()=>({...jest.requireActual('../modelWorkspace/flowHistory'),fetchFlowYear:jest.fn()}));
jest.mock('../modelWorkspace/flowHistoryView',()=>({...jest.requireActual('../modelWorkspace/flowHistoryView'),fetchFlowHistory:jest.fn()}));
const line={id:'Line:A',name:'A',from_node:'From',to_node:'To',values:new Map([['2050-01-01T00:00:00Z',50]])};
const scene={selection:{period:'2050',runId:'run',modelVersion:'v1',className:'Line',propertyName:'Flow',granularity:'hour',historyMetric:{propertyName:'Flow',availableGranularities:['hour'],unit:'MW'}},periods:[...line.values.keys()],lines:[line],unit:'MW',direction:1};
beforeEach(()=>{HTMLCanvasElement.prototype.getContext=jest.fn(()=>null);fetchFlowYear.mockReset();fetchFlowHistory.mockReset().mockImplementation((context,source,name,options)=>fetchFlowYear(context,source,[name],options));});
test('history follows the loaded resolution and preserves its full-year cache on map date change',async()=>{
  fetchFlowYear.mockResolvedValue({...scene,warnings:['December is unavailable'],stats:new Map([[line.id,{reportedHours:1,expectedHours:8760,validHours:0,nearHours:0,share:null}]])});
  const props={context:{projectId:'Test'},scene,line,onChoosePeriod:jest.fn()};
  const view=render(<LolaFlowHistoryDock {...props}/>);
  await screen.findByText(/1 \/ 8,760 reported hours/);
  expect(fetchFlowYear.mock.calls[0][2]).toEqual(['A']);
  expect(screen.getByLabelText('History zoom')).toHaveAttribute('max','8760');
  expect(screen.getByText('Show period on map')).toBeEnabled();
  expect(screen.getByLabelText('History resolution')).toHaveTextContent('Hourly · Flow · MW');
  expect(screen.queryByRole('combobox',{name:'History resolution'})).toBeNull();
  view.rerender(<LolaFlowHistoryDock {...props} scene={{...scene,selection:{...scene.selection,dateFrom:'2050-06-01'}}}/>);
  expect(fetchFlowYear).toHaveBeenCalledTimes(1);
});

test('Daily uses native daily energy, not the old hourly mean, and cancels stale hourly work',async()=>{
  let completeHour;
  fetchFlowHistory.mockImplementationOnce(()=>new Promise(resolve=>{completeHour=resolve;}));
  const dailyLine={...line,values:new Map([['2050-01-01',.8],['2050-01-02',.3]])};
  const daily={...scene,selection:{...scene.selection,granularity:'day'},unit:'GWh',lines:[dailyLine],periods:[...dailyLine.values.keys()]};
  fetchFlowHistory.mockResolvedValueOnce(daily);
  const props={context:{projectId:'Test'},scene,line};
  const view=render(<LolaFlowHistoryDock {...props}/>);
  const signal=fetchFlowHistory.mock.calls[0][3].signal;
  view.rerender(<LolaFlowHistoryDock {...props} scene={daily} line={dailyLine}/>);
  await screen.findByText('2 / 365 reported periods');
  expect(signal.aborted).toBe(true);
  expect(screen.getByLabelText('History resolution')).toHaveTextContent('Daily · Flow · GWh');
  expect(screen.getByLabelText('History zoom')).toHaveAttribute('max','365');
  expect(screen.getByText(/0.8 GWh/)).toBeInTheDocument();
  expect(screen.queryByText(/reported hours/)).toBeNull();
  await act(async()=>completeHour({...scene,stats:new Map()}));
  expect(screen.getByText(/0.8 GWh/)).toBeInTheDocument();
});

test('Annual reuses the exact net observation and units without loading hourly history',()=>{
  const annualLine={...line,values:new Map([['2050-01-01',-12]])};
  const annual={...scene,selection:{...scene.selection,propertyName:'Net Flow',granularity:'year'},unit:'GWh',lines:[annualLine],periods:[...annualLine.values.keys()]};
  render(<LolaFlowHistoryDock context={{projectId:'Test'}} scene={annual} line={annualLine}/>);
  expect(screen.getByLabelText('History resolution')).toHaveTextContent('Annual · Net Flow · GWh');
  expect(screen.getByLabelText('History zoom')).toHaveAttribute('max','1');
  expect(screen.getByText(/^2050 · -12 GWh.*To → From/)).toBeInTheDocument();
  expect(screen.queryByText('Show period on map')).toBeNull();
  expect(fetchFlowHistory).not.toHaveBeenCalled();
});

test('History Near capacity is controlled by the workspace and requests changes through the shared callback',()=>{
  const annualLine={...line,reportedLimits:new Map([['2050-01-01T00:00:00Z',{unit:'MW',forward:100,reverse:100}]])};
  const annual={...scene,selection:{...scene.selection,granularity:'year'},unit:'GWh',lines:[annualLine]};
  const props={context:{projectId:'Test'},scene:annual,line:annualLine,nearCapacity:true,onNearCapacityChange:jest.fn()};
  const view=render(<LolaFlowHistoryDock {...props}/>);
  expect(screen.getByLabelText('Near capacity',{exact:true})).toBeEnabled();
  expect(screen.getByLabelText('Near capacity',{exact:true})).toBeChecked();
  fireEvent.click(screen.getByLabelText('Near capacity',{exact:true}));
  expect(props.onNearCapacityChange).toHaveBeenCalledWith(false);
  view.rerender(<LolaFlowHistoryDock {...props} nearCapacity={false}/>);
  expect(screen.getByLabelText('Near capacity',{exact:true})).not.toBeChecked();
  view.rerender(<LolaFlowHistoryDock {...props} nearCapacityDisabled/>);
  expect(screen.getByLabelText('Near capacity',{exact:true})).toBeDisabled();
  expect(fetchFlowHistory).not.toHaveBeenCalled();
});

test.each(['week','month'])('%s switches synchronously without showing an old hourly history',async granularity=>{
  fetchFlowHistory.mockResolvedValue({...scene,stats:new Map([[line.id,{reportedHours:1,expectedHours:8760,validHours:0,nearHours:0}]])});
  const props={context:{projectId:'Test'},scene,line};
  const view=render(<LolaFlowHistoryDock {...props}/>);
  await screen.findByText(/reported hours/);
  fetchFlowHistory.mockImplementation(()=>new Promise(()=>{}));
  view.rerender(<LolaFlowHistoryDock {...props} scene={{...scene,unit:'GWh',selection:{...scene.selection,granularity}}}/>);
  expect(screen.queryByText(/reported hours/)).toBeNull();
  expect(screen.getByLabelText('History resolution')).toHaveTextContent(`${granularity==='week'?'Weekly':'Monthly'} · Flow · GWh`);
});
test('cancelled query cannot publish a stale history and can be retried',async()=>{
  let finish;fetchFlowYear.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const view=render(<LolaFlowHistoryDock context={{projectId:'Test'}} scene={scene} line={line}/>);
  fireEvent.click(screen.getByText('Cancel history load'));
  expect(fetchFlowYear.mock.calls[0][3].signal.aborted).toBe(true);
  await act(async()=>finish({...scene,stats:new Map()}));
  expect(screen.getByText(/History load cancelled/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Retry history'));await waitFor(()=>expect(fetchFlowYear).toHaveBeenCalledTimes(2));
  view.unmount();expect(fetchFlowYear.mock.calls[1][3].signal.aborted).toBe(true);
});

test('reported map samples remain inspectable while full-year history is loading',()=>{
  fetchFlowHistory.mockImplementation(()=>new Promise(()=>{}));
  const onChoosePeriod=jest.fn();
  render(<LolaFlowHistoryDock context={{projectId:'Test'}} scene={scene} line={line} onChoosePeriod={onChoosePeriod}/>);
  expect(screen.getByText(/Loading full-year history/)).toBeInTheDocument();
  expect(screen.getByText('Show period on map')).toBeEnabled();
  fireEvent.click(screen.getByText('Show period on map'));
  expect(onChoosePeriod).toHaveBeenCalledWith(scene.periods[0]);
});

test('a missing preview observation cannot be shown while history loads',()=>{
  fetchFlowHistory.mockImplementation(()=>new Promise(()=>{}));
  const missing={...line,values:new Map([[scene.periods[0],null]])};
  render(<LolaFlowHistoryDock context={{projectId:'Test'}} scene={{...scene,lines:[missing]}} line={missing} onChoosePeriod={jest.fn()}/>);
  expect(screen.getByText('Show period on map')).toBeDisabled();
});

test('switching connections never renders old history with missing statistics for the new line',async()=>{
  const result={...scene,warnings:[],stats:new Map([[line.id,{reportedHours:1,expectedHours:8760,validHours:1,nearHours:1,share:1}]])};
  fetchFlowYear.mockResolvedValueOnce(result).mockImplementation(()=>new Promise(()=>{}));
  const props={context:{projectId:'Test'},scene,line};
  const view=render(<LolaFlowHistoryDock {...props}/>);
  await screen.findByText(/1 \/ 8,760 reported hours/);
  const other={...line,id:'Line:B',name:'B'};
  expect(()=>view.rerender(<LolaFlowHistoryDock {...props} line={other} scene={{...scene,lines:[line,other]}}/>)).not.toThrow();
  expect(screen.queryByText(/1 \/ 8,760 reported hours/)).toBeNull();
  await waitFor(()=>expect(fetchFlowYear).toHaveBeenCalledTimes(2));
  view.rerender(<LolaFlowHistoryDock {...props}/>);
  await screen.findByText(/1 \/ 8,760 reported hours/);
  expect(fetchFlowYear).toHaveBeenCalledTimes(2);
});

test('hourly history switches day/week/month/year locally without new queries, and keeps aggregation on line changes',async()=>{
  const fullLine={...line,values:new Map([['2050-01-01T00:00:00Z',100],['2050-01-01T01:00:00Z',-20]])};
  const full={...scene,lines:[fullLine],periods:[...fullLine.values.keys()],stats:new Map()};
  fetchFlowHistory.mockResolvedValue(full);
  const props={context:{projectId:'Test'},scene,line,onChoosePeriod:jest.fn()};
  const view=render(<LolaFlowHistoryDock {...props}/>);
  await waitFor(()=>expect(screen.getByRole('combobox',{name:'History aggregation'})).toBeEnabled());
  for(const [resolution,count] of [['day',365],['week',53],['month',12],['year',1]]) {
    fireEvent.change(screen.getByLabelText('History aggregation'),{target:{value:resolution}});
    expect(screen.getByLabelText('History zoom')).toHaveAttribute('max',String(count));
    expect(screen.getByLabelText('History resolution')).toHaveTextContent('Mean Flow · MW');
    expect(screen.getByText(/40 MW/)).toBeInTheDocument();
  }
  expect(fetchFlowHistory).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Show first period on map'));
  expect(props.onChoosePeriod).toHaveBeenCalledWith('2050-01-01T00:00:00Z');
  const other={...line,id:'Line:B',name:'B'};
  fetchFlowHistory.mockResolvedValue({...full,lines:[{...fullLine,...other}]});
  view.rerender(<LolaFlowHistoryDock {...props} line={other} scene={{...scene,lines:[line,other]}}/>);
  await waitFor(()=>expect(screen.getByLabelText('History aggregation')).toBeEnabled());
  expect(screen.getByLabelText('History aggregation')).toHaveValue('year');
});
