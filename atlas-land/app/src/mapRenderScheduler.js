// Bound synchronous Leaflet construction work and yield to input/paint between
// batches. Cancellation invalidates the callback even if it was already queued.
export function scheduleMapFeatures(features, visit, {
  onComplete = () => {}, onError = () => {}, maxBatch = 200, budgetMs = 7,
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
  onMetrics = null,
} = {}) {
  let cancelled = false;
  let handle;
  let index = 0;
  const scheduledAt = onMetrics ? now() : 0;
  let batches = 0;
  let activeMs = 0;
  let maxBatchMs = 0;
  let maxFeatureMs = 0;
  const step = () => {
    if (cancelled) return;
    const started = now();
    let processed = 0;
    try {
      while (index < features.length && processed < maxBatch && (processed === 0 || now() - started < budgetMs)) {
        const visitStarted = onMetrics ? now() : 0;
        visit(features[index], index);
        if (onMetrics) maxFeatureMs = Math.max(maxFeatureMs, now() - visitStarted);
        index += 1;
        processed += 1;
        if (cancelled) return;
      }
      if (onMetrics) {
        const batchMs = now() - started;
        batches += 1;
        activeMs += batchMs;
        maxBatchMs = Math.max(maxBatchMs, batchMs);
      }
      if (index === features.length) {
        onMetrics?.({ features: index, batches, activeMs, maxBatchMs, maxFeatureMs, elapsedMs: now() - scheduledAt });
        onComplete();
      }
      else handle = requestFrame(step);
    } catch (error) {
      cancelled = true;
      onError(error);
    }
  };
  handle = requestFrame(step);
  return () => { cancelled = true; if (handle !== undefined) cancelFrame(handle); };
}
