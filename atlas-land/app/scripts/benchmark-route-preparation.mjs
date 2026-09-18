// Read-only algorithm benchmark. It is not browser latency or low-spec certification.
// node --expose-gc scripts/benchmark-route-preparation.mjs [--local] [--countries=BE,ES,FR]
// --local reads actual gas/water Grid snapshots from the running Atlas API.
// Without countries the water API serves a sampled overview, recorded below.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createConnectionGeometryResolver } from '../src/atlasMapGeometry.js';
import { createSpatialFeatureKey } from '../src/spatialFeatureKey.js';

// The former two-pass copying algorithm, kept here only as a measured baseline.
const oldGeometry = connection => {
  const number = value => value == null || typeof value === 'boolean' || String(value).trim() === '' ? NaN : Number(value);
  const coordinates = [];
  for (const point of connection.coordinates || []) {
    const lng = number(point?.[0]); const lat = number(point?.[1]);
    if (Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) coordinates.push([lng, lat]);
  }
  if (coordinates.length < 2) return null;
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  for (const [lng, lat] of coordinates) {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  if (west === east && south === north) return null;
  return { coordinates, bounds: { west, south, east, north }, fromLng: coordinates[0][0], fromLat: coordinates[0][1],
    toLng: coordinates.at(-1)[0], toLat: coordinates.at(-1)[1] };
};
const hash = text => {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); }
  return (value >>> 0).toString(36);
};
const oldColdKey = features => hash(features.map(f => `${f.id}|${hash(JSON.stringify(f.geometry.coordinates))}`).join('\n'));
const medianMs = fn => {
  const samples = [];
  for (let i = 0; i < 7; i += 1) {
    global.gc?.();
    const start = performance.now(); fn(); samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b)[3];
};

const countries = process.argv.find(arg => arg.startsWith('--countries='))?.split('=')[1] || '';
if (countries && !/^[A-Z]{2}(,[A-Z]{2})*$/.test(countries)) throw new Error('Countries must be comma-separated ISO2 codes');
const sources = process.argv.includes('--local') ? await Promise.all(['gas', 'water'].map(async carrier => {
  const url = `http://127.0.0.1:5001/api/atlas/${carrier}/network?domains=Grid${countries ? `&countries=${countries}` : ''}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${carrier} API returned ${response.status}`);
  const payload = await response.json();
  return { name: `local ${countries || 'European overview'} ${carrier} Grid API response`,
    overviewSampled: payload.meta?.overview_sampled === true, connections: payload.connections || [] };
})) : [{ name: 'synthetic routed network', connections: Array.from({ length: 1500 }, (_, id) => ({ id,
  coordinates: Array.from({ length: 500 }, (_, i) => [id / 100 + i / 1000, 45 + Math.sin(i / 10)]) })) }];

for (const source of sources) {
  const connections = source.connections.filter(c => Array.isArray(c.coordinates) && c.coordinates.length >= 2);
  const prepare = () => {
    const resolve = createConnectionGeometryResolver();
    return connections.map(c => resolve(c, () => null));
  };
  const expected = connections.map(oldGeometry);
  const prepared = prepare();
  assert.deepStrictEqual(prepared, expected, 'Coordinates, bounds and endpoints must match the previous algorithm');
  const features = prepared.flatMap((geometry, index) => geometry ? [{ id: String(index),
    geometry: { type: 'LineString', coordinates: geometry.coordinates }, properties: {} }] : []);
  const reusedSources = prepared.filter((geometry, index) => geometry?.coordinates === connections[index].coordinates).length;
  const reusedVertices = prepared.reduce((total, geometry, index) => total + (geometry?.coordinates === connections[index].coordinates ? geometry.coordinates.length : 0), 0);
  const beforeGeometryMs = medianMs(() => connections.map(oldGeometry));
  const afterGeometryMs = medianMs(prepare);
  const beforeColdKeyMs = medianMs(() => oldColdKey(features));
  const afterColdKeyMs = medianMs(() => createSpatialFeatureKey()('cold', { features }));
  console.log(JSON.stringify({ scope: 'source-route preparation only; excludes fetch/parse, endpoint-only lines, React and Leaflet drawing',
    source: source.name, overviewSampled: source.overviewSampled ?? false,
    totalLinks: source.connections.length, routedLinks: connections.length,
    sourceVertices: connections.reduce((sum, c) => sum + c.coordinates.length, 0), drawableRoutes: features.length,
    equalToPreviousGeometry: true, reusedSourceArrays: reusedSources, reusedVertexPairs: reusedVertices,
    samples: 7, gcBetweenSamples: Boolean(global.gc), beforeGeometryMedianMs: beforeGeometryMs,
    afterGeometryMedianMs: afterGeometryMs, beforeColdKeyMedianMs: beforeColdKeyMs,
    afterColdKeyMedianMs: afterColdKeyMs }, null, 2));
}
