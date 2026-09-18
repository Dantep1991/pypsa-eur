import { scheduleMapFeatures } from './mapRenderScheduler';

// Retire only an already-hidden, exclusively owned GeoJSON layer. Callers wait
// for this job before reusing its staging slot, bounding retained graphs to two.
export function retireMapLayer(map, layer, renderer, { onMetrics = null, ...schedulerOptions } = {}) {
  const children = layer?.getLayers?.() || [];
  const listeners = new Set();
  let done = false;
  let cancel = () => {};
  let metrics;
  let failure;
  let rendererDetached = false;
  const now = schedulerOptions.now || (() => performance.now());
  renderer?.discardDrawing?.();
  // Detach the canvas immediately: it must not keep projecting retired paths
  // on subsequent zoom/move events while their JS layer objects are released.
  try { if (renderer) map.removeLayer(renderer); rendererDetached = true; }
  catch (error) { failure = error; }
  const finish = () => {
    if (done) return;
    done = true;
    const finalizeStarted = onMetrics ? now() : 0;
    cancel();
    // With normal batched completion the group is empty. On workspace teardown
    // finish synchronously instead of leaving callbacks touching a removed map.
    try { if (layer) map.removeLayer(layer); }
    catch (error) { failure = error; }
    try { if (renderer && !rendererDetached) map.removeLayer(renderer); }
    catch (error) { failure = failure || error; }
    children.length = 0;
    if (metrics) metrics = { ...metrics, finalizeMs: now() - finalizeStarted };
    const callbacks = [...listeners];
    listeners.clear();
    callbacks.forEach(callback => callback({ metrics, error: failure }));
  };
  if (children.length) {
    cancel = scheduleMapFeatures(children, (child, index) => {
      layer.removeLayer(child);
      children[index] = null; // Release removed objects before the last batch.
    }, {
      maxBatch: 1000, budgetMs: 4, ...schedulerOptions,
      onMetrics: onMetrics ? value => { metrics = value; } : null,
      onComplete: () => { finish(); if (!failure) onMetrics?.(metrics); },
      onError: error => { failure = error; finish(); },
    });
  } else finish();
  return {
    get done() { return done; },
    finishNow: finish,
    whenDone(callback) {
      if (done) { callback({ metrics, error: failure }); return () => {}; }
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}
