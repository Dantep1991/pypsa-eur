import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import L from 'leaflet';
import OverviewNetworkCanvasLayer, { linesFromGeometry, styleKey } from './OverviewNetworkCanvasLayer';

let mockMap;
let mockCanvas;
jest.mock('react-leaflet', () => ({ useMap: () => mockMap }));
jest.mock('leaflet', () => ({
  __esModule: true,
  default: {
    DomUtil: {
      create: jest.fn(() => mockCanvas || { style: {}, getContext: jest.fn(), remove: jest.fn() }),
      setPosition: jest.fn(),
    },
  },
}));

let frames;
let originalRequest;
let originalCancel;

beforeEach(() => {
  jest.useFakeTimers();
  frames = new Map();
  originalRequest = global.requestAnimationFrame;
  originalCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = jest.fn((callback) => { frames.set(1, callback); return 1; });
  global.cancelAnimationFrame = jest.fn((id) => frames.delete(id));
  const context = {
    setTransform: jest.fn(), clearRect: jest.fn(), beginPath: jest.fn(),
    moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(), setLineDash: jest.fn(),
  };
  mockCanvas = { style: {}, getContext: jest.fn(() => context), remove: jest.fn() };
  L.DomUtil.create.mockImplementation(() => mockCanvas);
  const pane = { style: {}, appendChild: jest.fn() };
  mockMap = {
    getPane: jest.fn(() => pane), createPane: jest.fn(() => pane),
    getSize: jest.fn(() => ({ x: 800, y: 600 })),
    containerPointToLayerPoint: jest.fn(() => ({ x: 100, y: 200 })),
    latLngToLayerPoint: jest.fn(([latitude, longitude]) => ({
      x: longitude * 10, y: latitude * 10,
      subtract: ({ x, y }) => ({ x: longitude * 10 - x, y: latitude * 10 - y }),
    })),
    on: jest.fn(), off: jest.fn(),
  };
});

afterEach(() => {
  cleanup();
  global.requestAnimationFrame = originalRequest;
  global.cancelAnimationFrame = originalCancel;
  jest.useRealTimers();
});

const flushFrame = () => act(() => {
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback());
});

test('draws line and multiline features into one non-interactive canvas', () => {
  const progress = jest.fn();
  const dataKey = { id: 'dense' };
  const data = { type: 'FeatureCollection', features: [
    { properties: { style: { color: '#00ff00', weight: 2, opacity: 0.7 } }, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } },
    { properties: { style: { color: '#00ff00', weight: 2, opacity: 0.7 } }, geometry: { type: 'MultiLineString', coordinates: [[[5, 6], [7, 8]], [[9, 10], [11, 12]]] } },
  ] };
  const view = render(<OverviewNetworkCanvasLayer data={data} dataKey={dataKey} onProgress={progress} />);
  act(() => jest.advanceTimersByTime(300));
  flushFrame();
  flushFrame();

  const context = mockCanvas.getContext.mock.results[0].value;
  expect(mockCanvas.style.pointerEvents).toBe('none');
  expect(context.beginPath).toHaveBeenCalledTimes(1);
  expect(context.moveTo).toHaveBeenCalledTimes(3);
  expect(context.lineTo).toHaveBeenCalledTimes(3);
  expect(context.stroke).toHaveBeenCalledTimes(1);
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({
    key: dataKey, renderedLinks: 2, renderingLinks: false, renderError: '', overview: true,
  }));

  view.unmount();
  expect(mockMap.off).toHaveBeenCalledWith('resize moveend zoomend', expect.any(Function));
  expect(mockCanvas.remove).toHaveBeenCalledTimes(1);
});

test('geometry and style helpers reject unsupported shapes and group equal styles', () => {
  expect(linesFromGeometry({ type: 'Point', coordinates: [1, 2] })).toEqual([]);
  expect(linesFromGeometry({ type: 'LineString', coordinates: [[1, 2], [3, 4]] })).toHaveLength(1);
  expect(linesFromGeometry({ type: 'MultiLineString', coordinates: [[[1, 2], [3, 4]]] })).toHaveLength(1);
  expect(styleKey({ color: '#fff', weight: 2, opacity: 0.5, dashArray: '4 2' }))
    .toBe(styleKey({ color: '#fff', weight: 2, opacity: 0.5, dashArray: '4 2' }));
});

test('uses allocation-light Web Mercator projection when the live map exposes its pixel origin', () => {
  mockMap.getZoom = jest.fn(() => 2);
  mockMap.getPixelOrigin = jest.fn(() => ({ x: 400, y: 300 }));
  const data = { type: 'FeatureCollection', features: [{
    properties: { style: { color: '#38bdf8', weight: 1, opacity: 0.8 } },
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
  }] };
  render(<OverviewNetworkCanvasLayer data={data} dataKey="mercator" onProgress={jest.fn()} />);
  act(() => jest.advanceTimersByTime(300));
  flushFrame();
  flushFrame();

  const context = mockCanvas.getContext.mock.results[0].value;
  expect(context.moveTo).toHaveBeenCalledWith(12, 12);
  expect(context.lineTo).toHaveBeenCalledWith(15, 12);
  expect(mockMap.latLngToLayerPoint).not.toHaveBeenCalled();
});

test('dense geometry is split across animation frames before publishing completion', () => {
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  const progress = jest.fn();
  const data = { type: 'FeatureCollection', features: Array.from({ length: 501 }, (_, index) => ({
    properties: { style: { color: '#38bdf8', weight: 1, opacity: 0.8 } },
    geometry: { type: 'LineString', coordinates: [[index, 50], [index + 0.1, 50.1]] },
  })) };
  render(<OverviewNetworkCanvasLayer data={data} dataKey="chunked" onProgress={progress} />);

  act(() => jest.advanceTimersByTime(300));
  flushFrame(); // establish the canvas
  flushFrame(); // first bounded geometry batch
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ renderingLinks: true, renderedLinks: 0 }));
  expect(mockCanvas.getContext.mock.results[0].value.stroke).toHaveBeenCalledTimes(1);

  flushFrame(); // remaining feature and completion publication
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ renderingLinks: false, renderedLinks: 501, overview: true }));
  expect(mockCanvas.getContext.mock.results[0].value.stroke).toHaveBeenCalledTimes(2);
  clock.mockRestore();
});
