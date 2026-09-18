// Exercise the real installed Leaflet Canvas scheduling/removal implementation.
// Only requestAnimationFrame and the native 2D drawing context are substituted.
let L;
let createAtlasCanvas;
let frames;
let requestFrame;
let cancelFrame;
beforeEach(() => {
  frames = new Map();
  let next = 0;
  requestFrame = window.requestAnimationFrame;
  cancelFrame = window.cancelAnimationFrame;
  window.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
  window.cancelAnimationFrame = id => frames.delete(id);
  // Leaflet captures the native RAF functions when its module is loaded.
  jest.isolateModules(() => {
    L = require('leaflet');
    ({ createAtlasCanvas } = require('./atlasCanvas'));
  });
});
afterEach(() => {
  window.requestAnimationFrame = requestFrame;
  window.cancelAnimationFrame = cancelFrame;
});

function mount(renderer) {
  const context = { clearRect: jest.fn(), save: jest.fn(), restore: jest.fn(), setTransform: jest.fn(),
    beginPath: jest.fn(), rect: jest.fn(), clip: jest.fn() };
  renderer._map = {};
  renderer._container = document.createElement('canvas');
  renderer._ctx = context;
  return context;
}
const path = () => ({ options: { weight: 1 }, _pxBounds: L.bounds([0, 0], [10, 10]) });
function remove(renderer) {
  renderer.onRemove();
  renderer._map = null; // Map.removeLayer clears this after onRemove.
}

test('reproduces the unmodified Leaflet orphan-RAF failure after synchronous redraw then removal', () => {
  const renderer = L.canvas();
  mount(renderer);
  renderer._requestRedraw(path());
  renderer._redraw(); // Synchronous resize/_updatePaths redraw loses its RAF id.
  expect(frames.size).toBe(1);
  remove(renderer);
  expect(frames.size).toBe(1);
  expect(() => [...frames.values()][0]()).toThrow(TypeError);
});

test('owned Canvas cancels the old RAF before a synchronous resize redraw and removes cleanly', () => {
  const renderer = createAtlasCanvas({ padding: 0.1 });
  const context = mount(renderer);
  renderer._requestRedraw(path());
  expect(frames.size).toBe(1);
  renderer._redraw();
  expect(context.clearRect).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
  remove(renderer);
  expect(frames.size).toBe(0);
});

test('an already-delivered callback cannot touch a removed canvas, and remounting can draw again', () => {
  const renderer = createAtlasCanvas({ pane: 'test' });
  const oldContext = mount(renderer);
  renderer._requestRedraw(path());
  const delivered = [...frames.values()][0];
  remove(renderer);
  expect(() => delivered()).not.toThrow();
  expect(oldContext.clearRect).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  const newContext = mount(renderer);
  renderer._requestRedraw(path());
  [...frames.values()][0]();
  expect(newContext.clearRect).toHaveBeenCalledTimes(1);
  remove(renderer);
});

test('hidden batches avoid repeated graph painting, then paint every path once before becoming visible', () => {
  const exercise = deferred => {
    const renderer = createAtlasCanvas({ deferDrawing: deferred });
    const context = mount(renderer);
    const update = jest.fn();
    for (let batch = 0; batch < 20; batch += 1) {
      for (let index = 0; index < 100; index += 1) {
        const layer = { ...path(), _updatePath: update };
        renderer._initPath(layer);
        renderer._addPath(layer);
      }
      const queued = [...frames.values()]; frames.clear(); queued.forEach(callback => callback());
    }
    const beforeCommit = update.mock.calls.length;
    const paintsBeforeCommit = context.clearRect.mock.calls.length;
    renderer.finishDeferredDrawing();
    const afterCommit = update.mock.calls.length;
    const paintsAfterCommit = context.clearRect.mock.calls.length;
    // A repeated commit must not introduce another complete redraw.
    renderer.finishDeferredDrawing();
    expect(update).toHaveBeenCalledTimes(afterCommit);
    remove(renderer);
    expect(frames.size).toBe(0);
    return { beforeCommit, afterCommit, paintsBeforeCommit, paintsAfterCommit };
  };
  expect(exercise(false)).toEqual({ beforeCommit: 21000, afterCommit: 21000,
    paintsBeforeCommit: 20, paintsAfterCommit: 20 });
  expect(exercise(true)).toEqual({ beforeCommit: 0, afterCommit: 2000,
    paintsBeforeCommit: 0, paintsAfterCommit: 1 });
});

test('synchronous reset cannot paint a hidden buffer; committed buffers resume normal redraws', () => {
  const renderer = createAtlasCanvas({ deferDrawing: true });
  const context = mount(renderer);
  const update = jest.fn();
  const layer = { ...path(), _updatePath: update, _update: jest.fn() };
  renderer._initPath(layer);
  renderer._addPath(layer);
  renderer._updatePaths();
  expect(layer._update).toHaveBeenCalledTimes(1);
  expect(context.clearRect).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  renderer.finishDeferredDrawing();
  expect(update).toHaveBeenCalledTimes(1);
  renderer._requestRedraw(layer);
  expect(frames.size).toBe(1);
  [...frames.values()][0]();
  expect(update).toHaveBeenCalledTimes(2);
  remove(renderer);
  expect(frames.size).toBe(0);
});

test('a superseded hidden buffer is removed without ever painting', () => {
  const renderer = createAtlasCanvas({ deferDrawing: true });
  const context = mount(renderer);
  const layer = { ...path(), _updatePath: jest.fn() };
  renderer._initPath(layer);
  renderer._addPath(layer);
  remove(renderer);
  expect(layer._updatePath).not.toHaveBeenCalled();
  expect(context.clearRect).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});

test('discarding an owned canvas avoids per-path dirty bounds and queued teardown redraws', () => {
  const exercise = discard => {
    const renderer = createAtlasCanvas({ deferDrawing: true });
    mount(renderer);
    const layers = Array.from({ length: 2000 }, () => ({ ...path(), _updatePath: jest.fn() }));
    layers.forEach(layer => { renderer._initPath(layer); renderer._addPath(layer); });
    renderer.finishDeferredDrawing();
    const bounds = jest.spyOn(renderer, '_extendRedrawBounds');
    // Also cancel a redraw already queued before replacement was committed.
    renderer._requestRedraw(layers[0]);
    bounds.mockClear();
    if (discard) renderer.discardDrawing();
    layers.forEach(layer => renderer._removePath(layer));
    const result = { bounds: bounds.mock.calls.length, frames: frames.size, retained: Object.keys(renderer._layers).length };
    remove(renderer);
    expect(frames.size).toBe(0);
    return result;
  };
  expect(exercise(false)).toEqual({ bounds: 2000, frames: 1, retained: 0 });
  expect(exercise(true)).toEqual({ bounds: 0, frames: 0, retained: 0 });
});

test('retired paths can be removed after detaching their real Leaflet canvas', () => {
  const renderer = createAtlasCanvas({ deferDrawing: true });
  const context = mount(renderer);
  const layers = Array.from({ length: 500 }, () => ({ ...path(), _updatePath: jest.fn() }));
  layers.forEach(layer => { renderer._initPath(layer); renderer._addPath(layer); });
  renderer.finishDeferredDrawing();
  const draws = context.clearRect.mock.calls.length;
  renderer.discardDrawing();
  remove(renderer);
  expect(() => layers.forEach(layer => renderer._removePath(layer))).not.toThrow();
  expect(Object.keys(renderer._layers)).toHaveLength(0);
  expect(context.clearRect).toHaveBeenCalledTimes(draws);
  expect(frames.size).toBe(0);
});

test('deferred paint preserves real Leaflet multipart route drawing order, styles and separate paths', () => {
  const exercise = deferDrawing => {
    const renderer = createAtlasCanvas({ deferDrawing });
    const context = mount(renderer);
    const commands = [];
    context.moveTo = (x, y) => commands.push(['move', x, y]);
    context.lineTo = (x, y) => commands.push(['line', x, y]);
    context.setLineDash = dash => commands.push(['dash', dash]);
    context.stroke = () => commands.push(['stroke', context.strokeStyle, context.lineWidth, context.globalAlpha]);
    const routes = [
      { geometry: { type: 'LineString', coordinates: [[1, 1], [2, 3], [4, 4]] },
        color: '#34d399', dashArray: undefined, parts: [[[1, 1], [2, 3], [4, 4]]] },
      { geometry: { type: 'MultiLineString', coordinates: [[[5, 5], [6, 6]], [[8, 8], [9, 9]]] },
        color: '#22d3ee', dashArray: '4 3', parts: [[[5, 5], [6, 6]], [[8, 8], [9, 9]]] },
    ];
    for (const route of routes) {
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: route.geometry },
        { style: { color: route.color, dashArray: route.dashArray, opacity: 0.8, weight: 2 } }).getLayers()[0];
      layer._renderer = renderer;
      layer._parts = route.parts.map(part => part.map(point => L.point(point)));
      layer._pxBounds = L.bounds([0, 0], [10, 10]);
      renderer._initPath(layer);
      renderer._addPath(layer);
    }
    if (deferDrawing) renderer.finishDeferredDrawing();
    else renderer._redraw();
    remove(renderer);
    expect(frames.size).toBe(0);
    return commands;
  };
  const baseline = exercise(false);
  expect(exercise(true)).toEqual(baseline);
  expect(baseline).toEqual([
    ['move', 1, 1], ['line', 2, 3], ['line', 4, 4], ['dash', []], ['stroke', '#34d399', 2, 0.8],
    ['move', 5, 5], ['line', 6, 6], ['move', 8, 8], ['line', 9, 9],
    ['dash', [4, 3]], ['stroke', '#22d3ee', 2, 0.8],
  ]);
});
