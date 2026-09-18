import { scheduleMapFeatures } from './mapRenderScheduler';

const harness = () => {
  const frames = [];
  let clock = 0;
  return {
    frames,
    advance: (ms) => { clock += ms; },
    frame: () => frames.shift()?.(),
    options: { now: () => clock, requestFrame: (callback) => { frames.push(callback); return frames.length; }, cancelFrame: jest.fn() },
  };
};

test('large maps yield between bounded batches and deliver every feature in order', () => {
  const h = harness();
  const features = Array.from({ length: 30001 }, (_, id) => id);
  const visited = [];
  const done = jest.fn();
  scheduleMapFeatures(features, (feature) => visited.push(feature), { ...h.options, onComplete: done });
  expect(visited).toHaveLength(0);
  h.frame();
  expect(visited).toHaveLength(200);
  expect(done).not.toHaveBeenCalled();
  while (h.frames.length) h.frame();
  expect(visited).toEqual(features);
  expect(done).toHaveBeenCalledTimes(1);
});

test('time budget yields early when route construction is expensive', () => {
  const h = harness();
  const visit = jest.fn(() => h.advance(4));
  scheduleMapFeatures([1, 2, 3, 4], visit, h.options);
  h.frame();
  expect(visit).toHaveBeenCalledTimes(2);
  expect(h.frames).toHaveLength(1);
});

test('cancellation invalidates already queued frames and cannot publish completion', () => {
  const h = harness();
  const visit = jest.fn();
  const done = jest.fn();
  const cancel = scheduleMapFeatures([1, 2, 3], visit, { ...h.options, maxBatch: 1, onComplete: done });
  h.frame();
  cancel();
  while (h.frames.length) h.frame();
  expect(visit).toHaveBeenCalledTimes(1);
  expect(done).not.toHaveBeenCalled();
  expect(h.options.cancelFrame).toHaveBeenCalled();
});

test('failures stop scheduling and are reported without committing an incomplete graph', () => {
  const h = harness();
  const error = new Error('bad source feature');
  const failed = jest.fn();
  const done = jest.fn();
  scheduleMapFeatures([1, 2], () => { throw error; }, { ...h.options, onError: failed, onComplete: done });
  h.frame();
  expect(failed).toHaveBeenCalledWith(error);
  expect(done).not.toHaveBeenCalled();
  expect(h.frames).toHaveLength(0);
});

test('opt-in timings separate yielding from active work and expose an over-budget single link', () => {
  const h = harness();
  const metrics = jest.fn();
  const done = jest.fn();
  scheduleMapFeatures([2, 20, 3], (cost) => h.advance(cost), { ...h.options, onMetrics: metrics, onComplete: done });
  h.advance(16);
  h.frame();
  expect(metrics).not.toHaveBeenCalled();
  h.advance(16);
  h.frame();
  expect(metrics).toHaveBeenCalledWith({ features: 3, batches: 2, activeMs: 25,
    maxBatchMs: 22, maxFeatureMs: 20, elapsedMs: 57 });
  expect(done).toHaveBeenCalledTimes(1);
});

test('cancelled and failed drawings do not publish successful timing samples', () => {
  const h = harness();
  const metrics = jest.fn();
  const cancel = scheduleMapFeatures([1, 2], () => {}, { ...h.options, maxBatch: 1, onMetrics: metrics });
  h.frame();
  cancel();
  h.frame();
  scheduleMapFeatures([1], () => { throw new Error('Failed'); }, { ...h.options, onMetrics: metrics });
  h.frame();
  expect(metrics).not.toHaveBeenCalled();
});
