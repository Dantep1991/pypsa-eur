import React from 'react';
import { act, render } from '@testing-library/react';
import NetworkLineSelectionBridge from './NetworkLineSelectionBridge';
import L from 'leaflet';

let mockClick;
let mockHover, mockLeave, mockTick;
const mockTooltip = { setContent: jest.fn(), setLatLng: jest.fn(), addTo: jest.fn(), remove: jest.fn() };
jest.mock('leaflet', () => ({ __esModule: true, default: { tooltip: jest.fn(() => mockTooltip) } }));
const mockMap = {
  latLngToContainerPoint: ([lat, lng]) => ({ x: lng * 10, y: -lat * 10 }),
  containerPointToLatLng: ([x, y]) => ({ lat: -y / 10, lng: x / 10 }),
  on: jest.fn((name, handler) => { if (name === 'click') mockClick = handler; }),
  off: jest.fn((name, handler) => { if (name === 'click' && mockClick === handler) mockClick = null; }),
};
jest.mock('react-leaflet', () => ({ useMap: () => mockMap }));
const frame = lat => ({ features: [{ geometry: { type: 'LineString', coordinates: [[0, lat], [10, lat]] }, properties: { connection: { id: `line-${lat}` } } }] });
beforeEach(() => {
  mockClick = null;
  mockHover = null; mockLeave = null; mockTick = null;
  L.tooltip.mockImplementation(() => mockTooltip);
  Object.values(mockTooltip).forEach(method => method.mockImplementation(() => mockTooltip));
  window.requestAnimationFrame = jest.fn(callback => { mockTick = callback; return 1; });
  window.cancelAnimationFrame = jest.fn(() => { mockTick = null; });
  mockMap.on.mockImplementation((name, handler) => { if (name === 'click') mockClick = handler; if (name === 'mousemove') mockHover = handler; if (name === 'mouseout movestart zoomstart') mockLeave = handler; });
  mockMap.off.mockImplementation((name, handler) => { if (name === 'click' && mockClick === handler) mockClick = null; });
});

test('hover beneath a canvas gets a tolerant tooltip and native node hover or camera movement clears it', () => {
  const view = render(<NetworkLineSelectionBridge enabled data={frame(0)} onSelect={jest.fn()} />);
  const event = { containerPoint: { x: 50, y: 8 }, latlng: { lat: -.8, lng: 5 }, sourceTarget: mockMap };
  act(() => { mockHover(event); mockTick(); });
  expect(mockTooltip.setContent.mock.calls[0][0]).toContain('line-0');
  expect(mockTooltip.addTo).toHaveBeenCalledWith(mockMap);
  act(() => mockHover({ ...event, sourceTarget: {} }));
  expect(mockTooltip.remove).toHaveBeenCalled();
  act(() => { mockHover(event); mockLeave(); });
  expect(mockTick).toBeNull();
  view.unmount();
});

test('a map click beneath empty node canvas regions selects a line without Inspect mode', () => {
  const onSelect = jest.fn();
  const view = render(<NetworkLineSelectionBridge enabled data={frame(0)} onSelect={onSelect} />);
  act(() => mockClick({ containerPoint: { x: 50, y: 8 } }));
  expect(onSelect).toHaveBeenCalledWith({ kind: 'link', record: { id: 'line-0' } });
  onSelect.mockClear();
  act(() => mockClick({ containerPoint: { x: 50, y: 0 }, originalEvent: { atlasAssetSelected: true } }));
  expect(onSelect).not.toHaveBeenCalled();
  view.unmount(); expect(mockClick).toBeNull();
});
test('disabled land/flow contexts do not install picking and updated committed geometry replaces stale geometry', () => {
  const onSelect = jest.fn();
  const view = render(<NetworkLineSelectionBridge enabled data={frame(0)} onSelect={onSelect} />);
  view.rerender(<NetworkLineSelectionBridge enabled data={frame(3)} onSelect={onSelect} />);
  act(() => mockClick({ containerPoint: { x: 50, y: 0 } }));
  expect(onSelect).not.toHaveBeenCalled();
  act(() => mockClick({ containerPoint: { x: 50, y: -30 } }));
  expect(onSelect).toHaveBeenCalledWith({ kind: 'link', record: { id: 'line-3' } });
  view.rerender(<NetworkLineSelectionBridge enabled={false} data={frame(3)} onSelect={onSelect} />);
  expect(mockClick).toBeNull();
});
