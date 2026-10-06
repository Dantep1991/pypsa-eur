import React from 'react';
import { act, render } from '@testing-library/react';
import ModelResultFlowLayer from './ModelResultFlowLayer';

let mockMap;
jest.mock('react-leaflet', () => ({ useMap: () => mockMap }));

test('flow canvas resizes only on map changes, pauses when hidden and retires on unmount', () => {
  const container = document.createElement('div');
  const overlayPane = document.createElement('div'); container.appendChild(overlayPane);
  let origin = {x:0,y:0};
  document.body.appendChild(container);
  const events = new Map();
  mockMap = {
    getContainer: () => container, getSize: () => ({ x: 400, y: 200 }),
    getPanes: () => ({overlayPane}), containerPointToLayerPoint: () => origin,
    latLngToContainerPoint: ([lat, lon]) => ({ x: lon * 20, y: lat * 20 }),
    on: jest.fn((name, handler) => events.set(name, handler)), off: jest.fn(),
  };
  const callbacks = new Map();
  let nextFrame = 0;
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.set(++nextFrame, callback); return nextFrame;
  });
  const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id));
  const context = { setTransform: jest.fn(), clearRect: jest.fn(), createLinearGradient: () => ({ addColorStop: jest.fn() }),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(), closePath: jest.fn(), fill: jest.fn() };
  const canvasContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const media = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  const oldMedia = window.matchMedia;
  window.matchMedia = () => media;
  const line = { id: 'L', coordinates: [[1, 1], [5, 3]], magnitude: 20, color: 'teal' };
  const { unmount, rerender } = render(<ModelResultFlowLayer lines={[line]} />);
  const tick = time => {
    const [id, callback] = callbacks.entries().next().value;
    callbacks.delete(id); act(() => callback(time));
  };
  tick(100);
  const canvas = container.querySelector('canvas');
  expect(canvas.parentNode).toBe(overlayPane);
  expect(canvas.width).toBeGreaterThanOrEqual(400);
  tick(200);
  expect(context.fill).toHaveBeenCalled();
  expect(container.querySelectorAll('canvas')).toHaveLength(1);
  const head = context.moveTo.mock.calls.at(-1);
  rerender(<ModelResultFlowLayer lines={[{ ...line, magnitude: 30 }]} />);
  expect(container.querySelector('canvas')).toBe(canvas);
  expect(mockMap.on).toHaveBeenCalledTimes(1);
  tick(250);
  expect(context.moveTo.mock.calls.at(-1)[0]).toBeGreaterThan(head[0]);
  rerender(<ModelResultFlowLayer lines={[]} />);
  tick(260);
  expect(callbacks.size).toBe(0);
  rerender(<ModelResultFlowLayer lines={[line]} />);
  expect(container.querySelector('canvas')).toBe(canvas);
  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(callbacks.size).toBe(0);
  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  tick(300);
  media.matches = true;
  origin = {x:120,y:-35};
  act(() => events.get('move zoom viewreset resize')());
  tick(400);
  expect(canvas.style.left).toBe('120px'); expect(canvas.style.top).toBe('-35px');
  expect(callbacks.size).toBe(0); // reduced motion leaves a static arrow
  unmount();
  expect(container.querySelector('canvas')).toBeNull();
  expect(mockMap.off).toHaveBeenCalled();
  expect(media.removeEventListener).toHaveBeenCalled();
  container.remove();
  window.matchMedia = oldMedia;
  raf.mockRestore(); cancel.mockRestore(); canvasContext.mockRestore(); hidden.mockRestore();
});

test('zoom and live speed changes preserve normalised progress without replacing the canvas', () => {
  const container = document.createElement('div'), overlayPane = document.createElement('div');
  container.appendChild(overlayPane); document.body.appendChild(container);
  let zoom = 1, invalidate;
  mockMap = {
    getContainer: () => container, getSize: () => ({x:400,y:200}),
    getPanes: () => ({overlayPane}), containerPointToLayerPoint: () => ({x:0,y:0}),
    latLngToContainerPoint: ([lat,lon]) => ({x:lon*20*zoom,y:lat*20*zoom}),
    on: jest.fn((_events,callback) => { invalidate = callback; }), off: jest.fn(),
  };
  const callbacks = new Map(); let id = 0;
  const raf = jest.spyOn(window,'requestAnimationFrame').mockImplementation(callback => { callbacks.set(++id,callback); return id; });
  const cancel = jest.spyOn(window,'cancelAnimationFrame').mockImplementation(key => callbacks.delete(key));
  const context = {setTransform:jest.fn(),clearRect:jest.fn(),createLinearGradient:()=>({addColorStop:jest.fn()}),
    beginPath:jest.fn(),moveTo:jest.fn(),lineTo:jest.fn(),stroke:jest.fn(),closePath:jest.fn(),fill:jest.fn()};
  const canvasContext = jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
  const hidden = jest.spyOn(document,'hidden','get').mockReturnValue(false);
  const line = {id:'L',coordinates:[[0,0],[5,0]],magnitude:20,color:'teal'};
  const view = render(<ModelResultFlowLayer lines={[line]} animationSpeed={1}/>);
  const tick = time => { const [key,callback] = callbacks.entries().next().value; callbacks.delete(key); act(()=>callback(time)); return context.moveTo.mock.calls.at(-1)[0]; };
  tick(100); const first = tick(200), canvas = container.querySelector('canvas');
  zoom = 2; act(()=>invalidate());
  expect(tick(200)).toBeCloseTo(first*2);
  view.rerender(<ModelResultFlowLayer lines={[line]} animationSpeed={3}/>);
  const before = tick(200);
  expect(before).toBeCloseTo(first*2);
  expect(tick(300)-before).toBeCloseTo(200*.1*3/6);
  view.rerender(<ModelResultFlowLayer lines={[{...line,magnitude:40}]} animationSpeed={.25}/>);
  const slowStart = tick(300);
  expect(tick(400)-slowStart).toBeCloseTo(200*.1*.25/6);
  expect(container.querySelector('canvas')).toBe(canvas);
  expect(mockMap.on).toHaveBeenCalledTimes(1);
  view.unmount(); expect(callbacks.size).toBe(0);
  container.remove(); raf.mockRestore(); cancel.mockRestore(); canvasContext.mockRestore(); hidden.mockRestore();
});
