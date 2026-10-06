import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import L from 'leaflet';
import LolaFlowMapLayer from './LolaFlowMapLayer';
import ModelResultFlowLayer from './ModelResultFlowLayer';

jest.mock('leaflet', () => ({ __esModule: true, default: { svg: jest.fn(() => ({ type: 'svg' })) } }));
jest.mock('./ModelResultFlowLayer', () => jest.fn(() => null));
jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
    Pane: ({ name, style, children }) => <div data-testid={name} style={style}>{children}</div>,
    Tooltip: () => null,
    Polyline: React.forwardRef(({ renderer, eventHandlers, children, pathOptions }, ref) => {
      const pathRef = React.useRef(null);
      const layer = React.useMemo(() => ({ getElement: () => pathRef.current, on: jest.fn(), off: jest.fn() }), []);
      React.useImperativeHandle(ref, () => layer, [layer]);
      return <svg data-renderer={renderer.type}><path data-weight={pathOptions.weight} ref={pathRef} onClick={eventHandlers?.click} />{children}</svg>;
    }),
  };
});

const line = { id: 'Line:Exact', name: 'Exact', coordinates: [[1, 2], [3, 4]],
  actualFrom: 'A', actualTo: 'B', value: 12, unit: 'GWh', period: '2050' };
const frame = { lines: [line], selectedId: '', animated: true, maximum: 12 };
beforeEach(() => L.svg.mockReturnValue({ type: 'svg' }));

test('uses SVG hit targets on canvas maps and supports click, keyboard and listener cleanup', () => {
  const onSelect = jest.fn();
  const view = render(<LolaFlowMapLayer frame={frame} onSelect={onSelect} />);
  const path = screen.getByRole('button', { name: 'Flow connection Exact' });
  expect(L.svg).toHaveBeenCalled();
  expect(L.svg).toHaveBeenCalledWith({ pane: 'atlas-flow-connections' });
  expect(screen.getByTestId('atlas-flow-connections')).toHaveStyle({ zIndex: 460 });
  expect(path).toHaveAttribute('data-flow-connection', 'Line:Exact');
  expect(path).toHaveAttribute('data-weight', '16');
  expect(path).toHaveAttribute('aria-pressed', 'false');
  expect(path).toHaveStyle({cursor:'pointer'});
  fireEvent.click(path); fireEvent.keyDown(path, { key: 'Enter' }); fireEvent.keyDown(path, { key: ' ' });
  expect(onSelect.mock.calls).toEqual([['Line:Exact'], ['Line:Exact'], ['Line:Exact']]);
  view.unmount(); fireEvent.keyDown(path, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledTimes(3);
});

test('selected map connection exposes selection and keeps its keyboard listener',()=>{
  const onSelect=jest.fn(),view=render(<LolaFlowMapLayer frame={frame} onSelect={onSelect}/>);
  view.rerender(<LolaFlowMapLayer frame={{...frame,selectedId:line.id}} onSelect={onSelect}/>);
  const path=screen.getByRole('button',{name:'Flow connection Exact'});
  expect(path).toHaveAttribute('aria-pressed','true');
  fireEvent.keyDown(path,{key:'Enter'});
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test('replaces selection callbacks without stale or duplicate key handlers', () => {
  const previous = jest.fn(), next = jest.fn();
  const view = render(<LolaFlowMapLayer frame={frame} onSelect={previous} />);
  view.rerender(<LolaFlowMapLayer frame={frame} onSelect={next} />);
  fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
  expect(previous).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledTimes(1);
});

test('forwards the workspace display speed to the shared canvas renderer', () => {
  const flowLayer = ModelResultFlowLayer;
  const view = render(<LolaFlowMapLayer frame={{ ...frame, animationSpeed: .5 }} />);
  expect(flowLayer.mock.calls.at(-1)[0]).toMatchObject({ animationSpeed: .5, lines: frame.lines });
  view.rerender(<LolaFlowMapLayer frame={{ ...frame, animationSpeed: 3 }} />);
  expect(flowLayer.mock.calls.at(-1)[0].animationSpeed).toBe(3);
});
