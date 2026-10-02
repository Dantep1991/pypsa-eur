import React from 'react';
import '@testing-library/jest-dom';
import {render,screen,fireEvent,act} from '@testing-library/react';
import LolaParallelFlowChart from './LolaParallelFlowChart';

test.each([['hour','2050-01-01 00:00'],['day','2050-01-01'],['week','2050-01-01'],['month','2050-01'],['year','2050']])('history readout labels match %s granularity',(resolution,label)=>{
  HTMLCanvasElement.prototype.getContext=jest.fn(()=>null);
  render(<LolaParallelFlowChart line={{name:'A-B',from_node:'A',to_node:'B'}}
    samples={[{period:'2050-01-01T00:00:00Z',value:10}]} unit="MW" resolution={resolution}/>);
  expect(screen.getByText(`${label} · 10 MW · A → B`)).toBeInTheDocument();
});

test('transfer dots animate in opposite directions and stop on unmount',()=>{
  const callbacks=new Map();let id=0;
  const originalRAF=window.requestAnimationFrame,originalCancel=window.cancelAnimationFrame;
  window.requestAnimationFrame=callback=>{callbacks.set(++id,callback);return id;};
  window.cancelAnimationFrame=key=>callbacks.delete(key);
  const ctx={setTransform:jest.fn(),clearRect:jest.fn(),fillText:jest.fn(),beginPath:jest.fn(),moveTo:jest.fn(),lineTo:jest.fn(),stroke:jest.fn(),arc:jest.fn(),fill:jest.fn(),fillRect:jest.fn()};
  HTMLCanvasElement.prototype.getContext=jest.fn(()=>ctx);
  const line={name:'A-B',from_node:'A',to_node:'B'},samples=[{period:'2050-01-01T00:00:00Z',value:10},{period:'2050-01-01T01:00:00Z',value:-10}];
  const view=render(<LolaParallelFlowChart line={line} samples={samples} unit="MW" animated/>);
  const tick=time=>{const [key,callback]=callbacks.entries().next().value;callbacks.delete(key);act(()=>callback(time));};
  tick(350);expect(ctx.arc.mock.calls[0][1]).toBeLessThan(ctx.arc.mock.calls[1][1]);
  tick(1050);expect(ctx.arc.mock.calls[2][1]).toBeGreaterThan(ctx.arc.mock.calls[3][1]);
  fireEvent.change(screen.getByLabelText('History inspected period'),{target:{value:'1'}});
  expect(screen.getByText(/B → A/)).toBeInTheDocument();
  view.unmount();expect(callbacks.size).toBe(0);
  window.requestAnimationFrame=originalRAF;window.cancelAnimationFrame=originalCancel;
});
