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
  const { unmount } = render(<ModelResultFlowLayer lines={[{ id: 'L', coordinates: [[1, 1], [5, 3]], magnitude: 20, color: 'teal' }]} />);
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
