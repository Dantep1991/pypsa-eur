// Bounded, session-only catalogue cache. Projects, versions, API origins and
// schema metadata are separate keys; failed/cancelled reads never enter it.
const caches = new WeakMap();
const lifetime = 30 * 60 * 1000;

export async function cachedResultCatalog(fetchImpl, key, options, load) {
  let cache = caches.get(fetchImpl);
  if (!cache) { cache = new Map(); caches.set(fetchImpl, cache); }
  if (options.refresh) cache.delete(key);
  if (options.signal?.aborted) throw new DOMException('Catalogue load cancelled.', 'AbortError');
  const entry = cache.get(key);
  if (entry && Date.now() - entry.created < lifetime) {
    options.onProgress?.({ phase: 'cached', completed: entry.value.runs.length, total: entry.value.runs.length });
    return entry.value;
  }
  const value = await load();
  if (options.signal?.aborted) throw new DOMException('Catalogue load cancelled.', 'AbortError');
  cache.delete(key);
  cache.set(key, { value, created: Date.now() });
  if (cache.size > 8) cache.delete(cache.keys().next().value);
  return value;
}
