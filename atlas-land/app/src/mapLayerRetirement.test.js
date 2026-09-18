import { retireMapLayer } from './mapLayerRetirement';

function harness(size) {
  const frames = new Map();
  let id = 0;
  let time = 0;
  const initial = Array.from({ length: size }, (_, index) => ({ index }));
  const retained = new Set(initial);
  const renderer = { discardDrawing: jest.fn() };
  const layer = { getLayers: () => [...retained], removeLayer: jest.fn(child => { retained.delete(child); time += 0.05; }) };
  const map = { removeLayer: jest.fn(value => { if (value === layer) retained.clear(); }) };
  return { map, layer, renderer, retained, frames,
    frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
    options: { now: () => time, requestFrame: callback => { frames.set(++id, callback); return id; }, cancelFrame: key => frames.delete(key) },
  };
}

test('large retired drawings yield between bounded removals and release every layer exactly once', () => {
  const h = harness(2000);
  const measured = jest.fn();
  const job = retireMapLayer(h.map, h.layer, h.renderer, { ...h.options, onMetrics: measured });
  const finished = jest.fn();
  job.whenDone(finished);
  expect(h.renderer.discardDrawing).toHaveBeenCalledTimes(1);
  expect(h.layer.removeLayer).not.toHaveBeenCalled();
  h.frame();
  expect(h.retained.size).toBeGreaterThan(1800);
  expect(finished).not.toHaveBeenCalled();
  while (h.frames.size) h.frame();
  expect(job.done).toBe(true);
  expect(h.retained.size).toBe(0);
  expect(h.layer.removeLayer).toHaveBeenCalledTimes(2000);
  expect(h.map.removeLayer.mock.calls.map(([value]) => value)).toEqual([h.renderer, h.layer]);
  expect(finished).toHaveBeenCalledTimes(1);
  expect(measured.mock.calls[0][0]).toMatchObject({ features: 2000, batches: expect.any(Number) });
  expect(measured.mock.calls[0][0].maxBatchMs).toBeLessThanOrEqual(4.051);
});

test('teardown cancels even delivered frames and synchronously releases remaining layers', () => {
  const h = harness(1000);
  const job = retireMapLayer(h.map, h.layer, h.renderer, h.options);
  h.frame();
  const lateFrame = [...h.frames.values()][0];
  const ready = jest.fn();
  const unsubscribe = job.whenDone(ready);
  unsubscribe();
  job.finishNow();
  expect(h.frames.size).toBe(0);
  expect(h.retained.size).toBe(0);
  const calls = h.layer.removeLayer.mock.calls.length;
  lateFrame();
  job.finishNow();
  expect(h.layer.removeLayer).toHaveBeenCalledTimes(calls);
  expect(h.map.removeLayer).toHaveBeenCalledTimes(2);
  expect(ready).not.toHaveBeenCalled();
});

test('empty and partially initialized buffers can be disposed immediately', () => {
  const h = harness(0);
  const job = retireMapLayer(h.map, h.layer, h.renderer, h.options);
  expect(job.done).toBe(true);
  expect(h.frames.size).toBe(0);
  const ready = jest.fn();
  job.whenDone(ready);
  expect(ready).toHaveBeenCalledTimes(1);
  expect(retireMapLayer(h.map, undefined, h.renderer, h.options).done).toBe(true);
});

test('a removal failure finishes cleanup and reports it rather than leaving waiting builds stranded', () => {
  const h = harness(100);
  const error = new Error('Removal failed');
  h.layer.removeLayer.mockImplementationOnce(() => { throw error; });
  const measured = jest.fn();
  const done = jest.fn();
  const job = retireMapLayer(h.map, h.layer, h.renderer, { ...h.options, onMetrics: measured });
  job.whenDone(done);
  h.frame();
  expect(job.done).toBe(true);
  expect(done).toHaveBeenCalledWith({ metrics: undefined, error });
  expect(h.retained.size).toBe(0);
  expect(h.frames.size).toBe(0);
  expect(measured).not.toHaveBeenCalled();
});

test('real Leaflet GeoJSON membership and event parents are cleared without changing source geometry', () => {
  const L = require('leaflet');
  const source = { type: 'FeatureCollection', features: Array.from({ length: 601 }, (_, id) => ({
    type: 'Feature', id, properties: { source: `route-${id}` }, geometry: id % 2
      ? { type: 'LineString', coordinates: [[1, 40], [2, 41]] }
      : { type: 'MultiLineString', coordinates: [[[1, 40], [2, 41]], [[3, 42], [4, 43]]] },
  })) };
  const original = JSON.stringify(source);
  const group = L.geoJSON(source);
  const first = group.getLayers()[0];
  const events = jest.fn();
  group.on('probe', events);
  first.fire('probe', {}, true);
  expect(events).toHaveBeenCalledTimes(1);
  const h = harness(0);
  const job = retireMapLayer(h.map, group, h.renderer, { ...h.options, maxBatch: 200 });
  h.frame();
  expect(group.getLayers()).toHaveLength(401);
  while (h.frames.size) h.frame();
  expect(job.done).toBe(true);
  expect(group.getLayers()).toHaveLength(0);
  first.fire('probe', {}, true);
  expect(events).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(source)).toBe(original);
});
