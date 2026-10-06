import { assetPath, readAssetApi, validateAssetBinding } from './modelAssets';

// Shared by Model database and Map display. The API permits 1–64 exact IDs;
// Keep reads bounded rather than evaluating an entire class. Supply may opt in
// to four workers; publication still happens in source order after validation.
export const ASSET_INPUT_BATCH_SIZE = 50;
const recent = new Map();
export const clearAssetInputBatchCache = () => recent.clear();

// A first read can outlast the per-request timeout while the service builds its input snapshot. The service keeps
// building and caches it, so a second attempt usually returns at once. Dante's webinar dry run (5 Oct) lost the whole
// Supply overlay to one such cold batch. Only the client timer is retried, never cancellation or a service error, and
// only while the retry can finish inside one budget shared by the whole load, which keeps an Atlas chat request inside
// the assistant's 90 s receipt window.
export const ASSET_INPUT_TIMEOUT_RETRIES = 2;
export const ASSET_INPUT_RETRY_BUDGET_MS = 45000;

async function readBatch(url, options, retryUntil, fetchImpl) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readAssetApi(url, options, fetchImpl);
    } catch (error) {
      const retry = error?.name === 'TimeoutError' && attempt < ASSET_INPUT_TIMEOUT_RETRIES
        && !options.signal?.aborted && Date.now() + options.timeoutMs <= retryUntil;
      if (!retry) throw error;
    }
  }
}

export async function forEachAssetInputBatch({ projectId, version, className, propertyName,
  objects, category = '', inputDate = '', scenario = '', apiBase, signal,
  timeoutMs = 15000, concurrency = 1, reuse = false, onBatch,
  retryUntil = Date.now() + ASSET_INPUT_RETRY_BUDGET_MS }, fetchImpl) {
  if (concurrency > 1) {
    let offset = 0;
    const results = new Map();
    await Promise.all(Array.from({ length: Math.min(4, concurrency) }, async () => {
      while (offset < objects.length) {
        const start = offset;
        offset += ASSET_INPUT_BATCH_SIZE;
        await forEachAssetInputBatch({ projectId, version, className, propertyName,
          objects: objects.slice(start, start + ASSET_INPUT_BATCH_SIZE), category, inputDate, scenario,
          apiBase, signal, timeoutMs, reuse, retryUntil, onBatch: payload => results.set(start, payload) }, fetchImpl);
      }
    }));
    if (signal?.aborted) throw new DOMException('Input loading cancelled', 'AbortError');
    [...results.keys()].sort((a, b) => a - b).forEach(start => onBatch(results.get(start), {
      completed: Math.min(objects.length, start + ASSET_INPUT_BATCH_SIZE), total: objects.length,
    }));
    return;
  }
  for (let offset = 0; offset < objects.length; offset += ASSET_INPUT_BATCH_SIZE) {
    if (signal?.aborted) throw new DOMException('Input loading cancelled', 'AbortError');
    const ids = objects.slice(offset, offset + ASSET_INPUT_BATCH_SIZE).map(obj => obj.id);
    const url = assetPath(projectId, '/inputs', {
      version, class_name: className, property_name: propertyName, category,
      input_date: inputDate, scenario, object_ids: JSON.stringify(ids),
    });
    const key = `${apiBase || ''}:${url}`;
    const hit = reuse && recent.get(key);
    const fresh = hit && hit.expires > Date.now();
    const payload = validateAssetBinding(fresh ? hit.payload
      : await readBatch(url, { apiBase, signal, timeoutMs }, retryUntil, fetchImpl), projectId, version);
    if (signal?.aborted) throw new DOMException('Input loading cancelled', 'AbortError');
    if (!Array.isArray(payload.objects)
        || (payload.class_name != null && payload.class_name !== className)
        || (payload.property_name != null && payload.property_name !== propertyName)
        || payload.objects.some(obj => !ids.includes(obj.id))
        || new Set(payload.objects.map(obj => obj.id)).size !== payload.objects.length
        || (payload.resolution_contract && payload.objects.length !== ids.length)) {
      throw new Error('Input response does not match the requested schema objects.');
    }
    // Short-lived fulfilled snapshots only. The service owns durable caching
    // and file-change invalidation. A fresh inventory clears this UI cache.
    if (reuse && !fresh) {
      recent.set(key, { payload, expires: Date.now() + 30000 });
      while (recent.size > 256) recent.delete(recent.keys().next().value);
    }
    onBatch(payload, { completed: offset + ids.length, total: objects.length });
  }
}
