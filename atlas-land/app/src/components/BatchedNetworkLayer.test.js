import React, { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import L from 'leaflet';
import BatchedNetworkLayer from './BatchedNetworkLayer';

let mockMap;
jest.mock('react-leaflet', () => ({
  useMap: () => mockMap,
  Pane: ({ name, style }) => {
    const React = require('react');
    React.useEffect(() => {
      // Match real React-Leaflet: Pane style is applied only on creation.
      if (mockMap.panes.has(name)) throw new Error('Duplicate pane');
      mockMap.panes.set(name, { style: { ...style } });
      return () => mockMap.panes.delete(name);
    }, []);
    return null;
  },
}));
jest.mock('leaflet', () => ({
  canvas: jest.fn(), geoJSON: jest.fn(),
}));
jest.mock('../atlasCanvas', () => ({ createAtlasCanvas: options => require('leaflet').canvas(options) }));

let frames;
let nextFrame;
let originalRequest;
let originalCancel;
beforeEach(() => {
  frames = new Map(); nextFrame = 0;
  originalRequest = global.requestAnimationFrame;
  originalCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; };
  global.cancelAnimationFrame = (id) => frames.delete(id);
  mockMap = { layers: new Set(), panes: new Map(), getPane: (name) => mockMap.panes.get(name), removeLayer: (layer) => mockMap.layers.delete(layer) };
  jest.clearAllMocks();
  L.canvas.mockImplementation((options) => ({ options, finishDeferredDrawing: jest.fn(), discardDrawing: jest.fn() }));
  L.geoJSON.mockImplementation((_, options) => {
    const layer = {
      options, features: [],
      getLayers: () => [...layer.features],
      removeLayer: child => { const index = layer.features.indexOf(child); if (index >= 0) layer.features.splice(index, 1); },
      addTo: (map) => { map.layers.add(layer); map.layers.add(options.renderer); return layer; },
      addData: (feature) => {
        if (feature.fail) throw new Error('Route failed');
        layer.features.push(feature);
        options.onEachFeature?.(feature, layer);
        return layer;
      },
    };
    return layer;
  });
});
afterEach(() => {
  cleanup(); global.requestAnimationFrame = originalRequest; global.cancelAnimationFrame = originalCancel;
});
const frame = () => act(() => {
  const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback());
});
const finish = () => { let guard = 100; while (frames.size && guard-- > 0) frame(); expect(frames.size).toBe(0); };
const data = (length) => ({ type: 'FeatureCollection', features: Array.from({ length }, (_, id) => ({ id })) });
const visible = () => [...mockMap.panes.entries()].filter(([, pane]) => pane.style.visibility === 'visible').map(([name]) => name);

test('construction is batched; one complete graph replaces another without blank or partial visible graphs', () => {
  const progress = jest.fn();
  const first = data(301);
  const view = render(<BatchedNetworkLayer data={first} dataKey="first" smoothFactor={2} onProgress={progress} />);
  expect(L.canvas).toHaveBeenCalledWith(expect.objectContaining({ tolerance: 7 }));
  expect(visible()).toHaveLength(0);
  frame();
  expect(L.geoJSON.mock.results[0].value.features.length).toBeLessThan(301);
  expect(visible()).toHaveLength(0);
  expect(L.canvas.mock.results[0].value.options.deferDrawing).toBe(true);
  expect(L.canvas.mock.results[0].value.finishDeferredDrawing).not.toHaveBeenCalled();
  finish();
  expect(L.canvas.mock.results[0].value.finishDeferredDrawing).toHaveBeenCalledTimes(1);
  const firstPane = visible()[0];
  expect(progress).toHaveBeenLastCalledWith({ key: 'first', renderedLinks: 301, renderingLinks: false, renderError: '' });
  expect(mockMap.layers.size).toBe(2);
  expect(L.geoJSON.mock.results[0].value.options.smoothFactor).toBe(2);

  view.rerender(<BatchedNetworkLayer data={data(450)} dataKey="second" smoothFactor={1} onProgress={progress} />);
  frame();
  expect(visible()).toEqual([firstPane]);
  expect(mockMap.layers.size).toBe(4);
  finish();
  expect(visible()).toHaveLength(1);
  expect(visible()[0]).not.toBe(firstPane);
  expect(mockMap.layers.size).toBe(2);
  expect(mockMap.panes.size).toBe(2);
  expect(progress).toHaveBeenLastCalledWith({ key: 'second', renderedLinks: 450, renderingLinks: false, renderError: '' });
  view.unmount();
  expect(mockMap.layers.size).toBe(0);
  expect(mockMap.panes.size).toBe(0);
});

test('superseded renders cancel, retain the old graph and cannot publish late; identical keys do not rebuild', () => {
  const progress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(3)} dataKey="initial" onProgress={progress} />);
  finish();
  const initialPane = visible()[0];
  view.rerender(<BatchedNetworkLayer data={data(800)} dataKey="obsolete" onProgress={progress} />);
  frame();
  view.rerender(<BatchedNetworkLayer data={data(500)} dataKey="latest" onProgress={progress} />);
  expect(visible()).toEqual([initialPane]);
  finish();
  expect(progress.mock.calls.some(([state]) => state.key === 'obsolete' && !state.renderingLinks)).toBe(false);
  expect(progress).toHaveBeenLastCalledWith({ key: 'latest', renderedLinks: 500, renderingLinks: false, renderError: '' });
  const constructions = L.geoJSON.mock.calls.length;
  for (let index = 0; index < 20; index += 1) view.rerender(<BatchedNetworkLayer data={data(500)} dataKey="latest" onProgress={(state) => progress(state)} style={() => ({ color: 'blue' })} />);
  expect(L.geoJSON).toHaveBeenCalledTimes(constructions);
  expect(mockMap.panes.size).toBe(2);
  expect(mockMap.layers.size).toBe(2);
});

test('render errors keep the previous complete graph and remove the failed buffer', () => {
  const progress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(3)} dataKey="initial" onProgress={progress} />);
  finish();
  const initialPane = visible()[0];
  view.rerender(<BatchedNetworkLayer data={{ features: [{ fail: true }] }} dataKey="failed" onProgress={progress} />);
  finish();
  expect(visible()).toEqual([initialPane]);
  expect(mockMap.layers.size).toBe(2);
  expect(progress.mock.calls.at(-1)[0]).toMatchObject({ key: 'failed', renderedLinks: 3, renderingLinks: false, renderError: expect.stringContaining('previous view has been kept') });
});

test('the old graph stays committed if the final hidden canvas paint fails', () => {
  const progress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(3)} dataKey="initial" onProgress={progress} />);
  finish();
  const initialPane = visible()[0];
  L.canvas.mockImplementationOnce(options => ({ options, finishDeferredDrawing: () => { throw new Error('Paint failed'); } }));
  view.rerender(<BatchedNetworkLayer data={data(3)} dataKey="failed-paint" onProgress={progress} />);
  finish();
  expect(visible()).toEqual([initialPane]);
  expect(mockMap.layers.size).toBe(2);
  expect(progress.mock.calls.at(-1)[0]).toMatchObject({ key: 'failed-paint', renderedLinks: 3,
    renderingLinks: false, renderError: expect.stringContaining('previous view') });
});

test('old canvas redraws are disabled before removing its paths on replacement and unmount', () => {
  const view = render(<BatchedNetworkLayer data={data(200)} dataKey="old" />);
  finish();
  const previous = L.geoJSON.mock.results[0].value;
  const remove = mockMap.removeLayer;
  mockMap.removeLayer = layer => {
    if (layer === previous) expect(previous.options.renderer.discardDrawing).toHaveBeenCalled();
    remove(layer);
  };
  view.rerender(<BatchedNetworkLayer data={data(10)} dataKey="new" />);
  finish();
  const current = L.geoJSON.mock.results.at(-1).value;
  expect(current.options.renderer.discardDrawing).not.toHaveBeenCalled();
  view.unmount();
  expect(current.options.renderer.discardDrawing).toHaveBeenCalled();
  expect(mockMap.layers.size).toBe(0);
});

test('diagnostic samples accompany only completed draws and do not change feature counts', () => {
  const progress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(301)} dataKey="profiled" onProgress={progress} diagnostics />);
  frame();
  expect(progress.mock.calls.at(-1)[0].diagnostics).toBeUndefined();
  finish();
  expect(progress.mock.calls.at(-1)[0]).toMatchObject({ renderedLinks: 301, renderingLinks: false,
    diagnostics: { features: 301, batches: expect.any(Number), setupMs: expect.any(Number),
      activeMs: expect.any(Number), maxBatchMs: expect.any(Number), maxFeatureMs: expect.any(Number),
      paintMs: expect.any(Number), retireSetupMs: expect.any(Number), totalMs: expect.any(Number) } });
  const constructions = L.geoJSON.mock.calls.length;
  view.rerender(<BatchedNetworkLayer data={data(301)} dataKey="profiled" onProgress={progress} diagnostics />);
  expect(L.geoJSON).toHaveBeenCalledTimes(constructions);
  view.rerender(<BatchedNetworkLayer data={{ features: [{ fail: true }] }} dataKey="failed" onProgress={progress} diagnostics />);
  finish();
  expect(progress.mock.calls.at(-1)[0].diagnostics).toBeUndefined();
});

test('new source metadata replaces hover/click bindings even when geometry and style are unchanged', () => {
  const attached = jest.fn();
  const view = render(<BatchedNetworkLayer data={{ features: [{ id: 1, name: 'Old source' }] }} dataKey="same-geometry" sourceKey="old" onEachFeature={attached} />);
  finish();
  view.rerender(<BatchedNetworkLayer data={{ features: [{ id: 1, name: 'New source' }] }} dataKey="same-geometry" sourceKey="new" onEachFeature={attached} />);
  finish();
  expect(L.geoJSON).toHaveBeenCalledTimes(2);
  expect(attached.mock.calls.at(-1)[0].name).toBe('New source');
});

test.each(['canvas', 'geoJSON', 'addTo'])('initialisation failure in %s keeps the committed graph and reports an error', (stage) => {
  const progress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(3)} dataKey="initial" onProgress={progress} />);
  finish();
  const initialPane = visible()[0];
  if (stage === 'addTo') {
    L.geoJSON.mockImplementationOnce(() => ({ addTo: () => { throw new Error('Unavailable'); } }));
  } else L[stage].mockImplementationOnce(() => { throw new Error('Unavailable'); });
  view.rerender(<BatchedNetworkLayer data={data(4)} dataKey="failed" onProgress={progress} />);
  expect(visible()).toEqual([initialPane]);
  expect(frames.size).toBe(0);
  expect(mockMap.layers.size).toBe(2);
  expect(progress.mock.calls.at(-1)[0]).toMatchObject({ key: 'failed', renderingLinks: false, renderError: expect.stringContaining('previous view') });
});

test('Strict Mode and unmount release pending frames, layers and both fixed panes', () => {
  const progress = jest.fn();
  const view = render(<StrictMode><BatchedNetworkLayer data={data(600)} dataKey="strict" onProgress={progress} /></StrictMode>);
  frame();
  view.unmount();
  expect(frames.size).toBe(0);
  expect(mockMap.layers.size).toBe(0);
  expect(mockMap.panes.size).toBe(0);
  expect(progress.mock.calls.some(([state]) => !state.renderingLinks)).toBe(false);
});

test('rapid requests during retirement wait for the slot and only build the latest target', () => {
  const progress = jest.fn();
  const retirementProgress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(1000)} dataKey="large" onProgress={progress} diagnostics onRetirementProgress={retirementProgress} />);
  finish();
  view.rerender(<BatchedNetworkLayer data={data(3)} dataKey="small" onProgress={progress} diagnostics onRetirementProgress={retirementProgress} />);
  frame();
  const smallPane = visible()[0];
  expect(progress.mock.calls.at(-1)[0]).toMatchObject({ key: 'small', renderedLinks: 3, renderingLinks: false });
  expect(mockMap.layers.size).toBe(3); // Old canvas is detached; only its group is retiring.
  expect(L.geoJSON.mock.results[0].value.features.length).toBe(1000);
  for (let i = 0; i < 15; i += 1) {
    view.rerender(<BatchedNetworkLayer data={data(5)} dataKey={`waiting-${i}`} onProgress={progress} diagnostics onRetirementProgress={retirementProgress} />);
    expect(L.geoJSON).toHaveBeenCalledTimes(2);
    expect(visible()).toEqual([smallPane]);
    expect(mockMap.layers.size).toBe(3);
  }
  while (frames.size) {
    frame();
    expect(mockMap.layers.size).toBeLessThanOrEqual(4);
    expect(visible()).toHaveLength(1);
  }
  expect(L.geoJSON).toHaveBeenCalledTimes(3);
  expect(progress.mock.calls.at(-1)[0]).toMatchObject({ key: 'waiting-14', renderedLinks: 5, renderingLinks: false });
  expect(progress.mock.calls.some(([state]) => state.key === 'waiting-13' && !state.renderingLinks)).toBe(false);
  expect(retirementProgress.mock.calls.at(-1)[0]).toMatchObject({ retiring: false, metrics: { features: 3 } });
  expect(mockMap.layers.size).toBe(2);
  view.unmount();
  expect(mockMap.layers.size).toBe(0);
  expect(frames.size).toBe(0);
});

test('unmount during retirement cannot start a waiting drawing or publish cleanup later', () => {
  const progress = jest.fn();
  const retired = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(1000)} dataKey="large" onProgress={progress} diagnostics onRetirementProgress={retired} />);
  finish();
  view.rerender(<BatchedNetworkLayer data={data(3)} dataKey="small" onProgress={progress} diagnostics onRetirementProgress={retired} />);
  frame();
  view.rerender(<BatchedNetworkLayer data={data(200)} dataKey="waiting" onProgress={progress} diagnostics onRetirementProgress={retired} />);
  const callbacks = [...frames.values()];
  view.unmount();
  const reports = retired.mock.calls.length;
  callbacks.forEach(callback => callback());
  expect(L.geoJSON).toHaveBeenCalledTimes(2);
  expect(retired).toHaveBeenCalledTimes(reports);
  expect(mockMap.layers.size).toBe(0);
  expect(frames.size).toBe(0);
});

test('failed retirement quarantines its slot rather than accumulating abandoned drawings', () => {
  const progress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(600)} dataKey="large" onProgress={progress} />);
  finish();
  L.geoJSON.mock.results[0].value.removeLayer = () => { throw new Error('Retirement failed'); };
  view.rerender(<BatchedNetworkLayer data={data(3)} dataKey="small" onProgress={progress} />);
  finish();
  const committedPane = visible()[0];
  for (let index = 0; index < 5; index += 1) {
    view.rerender(<BatchedNetworkLayer data={data(3)} dataKey={`blocked-${index}`} onProgress={progress} />);
    finish();
    expect(progress.mock.calls.at(-1)[0]).toMatchObject({ renderingLinks: false, renderError: expect.stringContaining('previous view') });
    expect(L.geoJSON).toHaveBeenCalledTimes(2);
    expect(visible()).toEqual([committedPane]);
  }
});

test('hiding every line commits an empty frame and retires the old paths across frames', () => {
  const progress = jest.fn();
  const view = render(<BatchedNetworkLayer data={data(2500)} dataKey="large" onProgress={progress} />);
  finish();
  const old = L.geoJSON.mock.results[0].value;
  view.rerender(<BatchedNetworkLayer data={data(0)} dataKey="hidden" onProgress={progress} />);
  frame();
  expect(progress).toHaveBeenLastCalledWith({ key: 'hidden', renderedLinks: 0, renderingLinks: false, renderError: '' });
  expect(visible()).toEqual([L.geoJSON.mock.results[1].value.options.pane]);
  expect(old.features).toHaveLength(2500); // No bulk removal during the swap.
  frame();
  expect(old.features.length).toBeGreaterThanOrEqual(1500);
  expect(old.features.length).toBeLessThan(2500);
  view.rerender(<BatchedNetworkLayer data={data(50)} dataKey="shown-again" onProgress={progress} />);
  expect(L.geoJSON).toHaveBeenCalledTimes(2); // Wait for the retiring slot.
  finish();
  expect(old.features).toHaveLength(0);
  expect(progress).toHaveBeenLastCalledWith({ key: 'shown-again', renderedLinks: 50, renderingLinks: false, renderError: '' });
  expect(mockMap.layers.size).toBe(2);
  expect(mockMap.panes.size).toBe(2);
});

test('fifty completed replacements keep a fixed renderer/pane budget and release all on unmount', () => {
  const view = render(<BatchedNetworkLayer data={data(201)} dataKey="start" />);
  finish();
  for (let index = 0; index < 50; index += 1) {
    view.rerender(<BatchedNetworkLayer data={data(201 + index)} dataKey={`replacement-${index}`} />);
    expect(mockMap.layers.size).toBeLessThanOrEqual(4);
    finish();
    expect(mockMap.layers.size).toBe(2);
    expect(mockMap.panes.size).toBe(2);
    expect(visible()).toHaveLength(1);
  }
  view.unmount();
  expect(mockMap.layers.size).toBe(0);
  expect(mockMap.panes.size).toBe(0);
  expect(frames.size).toBe(0);
});
