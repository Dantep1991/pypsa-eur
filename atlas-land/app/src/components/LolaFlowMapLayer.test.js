import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import L from 'leaflet';
import LolaFlowMapLayer from './LolaFlowMapLayer';

jest.mock('leaflet', () => ({ __esModule: true, default: { svg: jest.fn(() => ({ type: 'svg' })) } }));
jest.mock('./ModelResultFlowLayer', () => () => null);
jest.mock('react-leaflet', () => {
  const React = require('react');
  return {
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
  expect(path).toHaveAttribute('data-flow-connection', 'Line:Exact');
  expect(path).toHaveAttribute('data-weight', '16');
  fireEvent.click(path); fireEvent.keyDown(path, { key: 'Enter' }); fireEvent.keyDown(path, { key: ' ' });
  expect(onSelect.mock.calls).toEqual([['Line:Exact'], ['Line:Exact'], ['Line:Exact']]);
  view.unmount(); fireEvent.keyDown(path, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledTimes(3);
});

test('replaces selection callbacks without stale or duplicate key handlers', () => {
  const previous = jest.fn(), next = jest.fn();
  const view = render(<LolaFlowMapLayer frame={frame} onSelect={previous} />);
  view.rerender(<LolaFlowMapLayer frame={frame} onSelect={next} />);
  fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
  expect(previous).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledTimes(1);
});
