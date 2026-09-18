import { atlasAssetUrl } from './config/assets';

let cachedUrl = '';
let cachedBoundaries = null;
let pendingBoundaries = null;

function validateBoundaries(data) {
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Boundary asset is not a GeoJSON FeatureCollection.');
  }
  return data;
}

// Country boundaries are release data, not mutable UI state. Keep one parsed
// object for the lifetime of the page so map recovery/remounts do not download
// and parse the 1.4 MB asset again. Failed requests are never cached.
export function loadEuropeBoundaries({
  url = atlasAssetUrl('europe.geojson'),
  fetcher = fetch,
} = {}) {
  if (typeof fetcher !== 'function') return Promise.reject(new Error('Boundary asset fetch is unavailable.'));
  if (cachedUrl !== url) {
    cachedUrl = url;
    cachedBoundaries = null;
    pendingBoundaries = null;
  }
  if (cachedBoundaries) return Promise.resolve(cachedBoundaries);
  if (pendingBoundaries) return pendingBoundaries;

  const requestUrl = url;
  let request;
  request = Promise.resolve(fetcher(requestUrl, { cache: 'force-cache' }))
    .then((response) => {
      if (!response?.ok) throw new Error(`Boundary asset request failed (${response?.status || 'unknown'}).`);
      return response.json();
    })
    .then(validateBoundaries)
    .then((data) => {
      // An alternate mount may have been requested while this response was in
      // flight. Return its valid result to the original caller, but never let
      // an older request overwrite the newer cache identity.
      if (cachedUrl === requestUrl && pendingBoundaries === request) {
        cachedBoundaries = data;
        pendingBoundaries = null;
      }
      return data;
    })
    .catch((error) => {
      if (cachedUrl === requestUrl && pendingBoundaries === request) {
        pendingBoundaries = null;
        cachedBoundaries = null;
      }
      throw error;
    });
  pendingBoundaries = request;
  return request;
}

// Test isolation only; production callers should retain the page-lifetime cache.
export function resetEuropeBoundaryCache() {
  cachedUrl = '';
  cachedBoundaries = null;
  pendingBoundaries = null;
}
