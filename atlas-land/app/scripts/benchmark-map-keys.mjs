// Algorithm microbenchmark, not a browser or low-spec hardware certification.
// Run with the existing Node 24 runtime: node scripts/benchmark-map-keys.mjs
import { performance } from 'node:perf_hooks';
import { createSpatialFeatureKey } from '../src/spatialFeatureKey.js';
import { connectionGeometry, createConnectionGeometryResolver } from '../src/atlasMapGeometry.js';

const routes = 1500;
const vertices = 500;
const features = Array.from({ length: routes }, (_, id) => ({
  id: `route-${id}`, properties: { style: { opacity: 0.8 } },
  geometry: { type: 'LineString', coordinates: Array.from({ length: vertices }, (_, i) => [id / 100 + i / 1000, 45 + Math.sin(i / 10)]) },
}));
const collection = { features };
const legacy = (prefix, { features }) => {
  let hash = 2166136261;
  for (const feature of features) {
    const style = feature.properties.style;
    const identity = `${feature.id}|${JSON.stringify(feature.geometry.coordinates)}|||${style.opacity ?? ''}`;
    for (let i = 0; i < identity.length; i += 1) { hash ^= identity.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  }
  return `${prefix}-${features.length}-${(hash >>> 0).toString(36)}`;
};
const cached = createSpatialFeatureKey();
const time = fn => { const start = performance.now(); fn(); return performance.now() - start; };
const coldMs = time(() => cached('cold', collection));
const repeated = fn => Array.from({ length: 15 }, (_, index) => time(() => fn(`z${index % 6}`, collection))).sort((a, b) => a - b);
const old = repeated(legacy);
const next = repeated(cached);
const connections = features.map(feature => ({ id: feature.id, coordinates: feature.geometry.coordinates }));
const resolve = createConnectionGeometryResolver();
const noEndpoint = () => null;
const cachedGeometryColdMs = time(() => connections.forEach(connection => resolve(connection, noEndpoint)));
const uncachedGeometry = repeated(() => connections.forEach(connection => connectionGeometry(connection, noEndpoint)));
const cachedGeometry = repeated(() => connections.forEach(connection => resolve(connection, noEndpoint)));
console.log(JSON.stringify({ scope: 'single-process synthetic key and geometry calculation only', routes, vertices: routes * vertices,
  iterations: old.length, cachedColdMs: coldMs, legacyMedianMs: old[7], cachedMedianMs: next[7],
  legacyMaxMs: old.at(-1), cachedMaxMs: next.at(-1), medianSpeedup: old[7] / next[7],
  cachedGeometryColdMs, uncachedGeometryMedianMs: uncachedGeometry[7], cachedGeometryMedianMs: cachedGeometry[7] }, null, 2));
