import React from 'react';
import '@testing-library/jest-dom';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import LolaCapacityEvidence from './LolaCapacityEvidence';
import {fetchFlowYear} from '../modelWorkspace/flowHistory';
jest.mock('../modelWorkspace/flowHistory',()=>({...jest.requireActual('../modelWorkspace/flowHistory'),fetchFlowYear:jest.fn()}));
const scene={selection:{historyMetric:{availableGranularities:['hour']}},lines:[{id:'A',name:'A',coordinates:[[1,2],[3,4]]},{id:'B',name:'B',coordinates:[]}]};
test('capacity hours are explicitly requested, mapped-only and colour threshold is user controlled',async()=>{
  const stats=new Map([['A',{share:.5,nearHours:50,validHours:100,expectedHours:8760}]]),onEvidence=jest.fn();
  fetchFlowYear.mockResolvedValue({stats,warnings:[]});
  render(<LolaCapacityEvidence projectId="Test" scene={scene} onEvidence={onEvidence}/>);
  expect(fetchFlowYear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Calculate capacity hours'));
  await screen.findByText(/1 of 1 connections/);
  expect(fetchFlowYear.mock.calls[0][2]).toEqual(['A']);expect(fetchFlowYear.mock.calls[0][3].collect).toBe(false);
  await waitFor(()=>expect(onEvidence.mock.calls.at(-1)[0].threshold).toBe(.05));
  fireEvent.change(screen.getByLabelText('Capacity hours threshold'),{target:{value:'60'}});
  expect(screen.getByText(/0 of 1 connections/)).toBeInTheDocument();
  expect(onEvidence.mock.calls.at(-1)[0].threshold).toBe(.6);
  fireEvent.click(screen.getByLabelText('Colour map by hours near capacity'));expect(onEvidence).toHaveBeenLastCalledWith(null);
});
test('a scope change aborts the outstanding analysis',async()=>{
  fetchFlowYear.mockImplementation(()=>new Promise(()=>{}));const onEvidence=jest.fn();
  const view=render(<LolaCapacityEvidence projectId="Test" scene={scene} onEvidence={onEvidence}/>);
  fireEvent.click(screen.getByText('Calculate capacity hours'));const signal=fetchFlowYear.mock.calls.at(-1)[3].signal;
  view.rerender(<LolaCapacityEvidence projectId="Test" scene={{...scene,lines:[]}} onEvidence={onEvidence}/>);
  await waitFor(()=>expect(signal.aborted).toBe(true));expect(onEvidence).toHaveBeenLastCalledWith(null);
});

test('threshold changes and map date reloads reuse completed hourly evidence',async()=>{
  fetchFlowYear.mockClear();
  const counts=Array(101).fill(0);counts[95]=40;counts[100]=60;
  fetchFlowYear.mockResolvedValue({stats:new Map([['A',{validHours:100,reportedHours:100,nearHours:60,utilisationCounts:counts}]]),warnings:[]});
  const onEvidence=jest.fn(),props={projectId:'Test',scene,onEvidence};
  const view=render(<LolaCapacityEvidence {...props}/>);
  fireEvent.click(screen.getByText('Calculate capacity hours'));
  await screen.findByText(/1 of 1 connections/);
  view.rerender(<LolaCapacityEvidence {...props} nearPercent={95} scene={{...scene,selection:{...scene.selection,dateFrom:'2050-06-01'}}}/>);
  await waitFor(()=>expect(onEvidence.mock.calls.at(-1)[0].stats.get('A').nearHours).toBe(100));
  expect(fetchFlowYear).toHaveBeenCalledTimes(1);
});
