// Receives in-process candidate API responses from smoke_water_multipart.py.
// No listener or browser access; runs the production geometry resolver.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { connectionGeometry, createConnectionGeometryResolver, createViewportGeometrySelector, geometryIntersectsViewport } from '../src/atlasMapGeometry.js';

const { before, after } = JSON.parse(readFileSync(0, 'utf8'));
assert.deepEqual(before.map(link => link.id), after.map(link => link.id));
const resolve = createConnectionGeometryResolver();
const start = performance.now();
const previous = before.map(link => resolve(link, () => null));
const next = after.map(link => resolve(link, () => null));
const coldMs = performance.now() - start;
let restored = 0; let paths = 0; let vertices = 0;
let utilityVerticesBefore = 0; let utilityVerticesAfter = 0; let utilityRoutesChanged = 0;
for (let index = 0; index < after.length; index += 1) {
  if (previous[index]) assert(next[index], `Lost drawable link ${after[index].id}`);
  if (!previous[index] && next[index]) restored += 1;
  if (after[index].coordinate_paths) {
    assert(next[index]?.type === 'MultiLineString', after[index].id);
    for (const path of next[index].coordinates) {
      assert(after[index].coordinate_paths.includes(path), 'Do not fabricate/concatenate source branches');
      paths += 1; vertices += path.length;
    }
  } else if (after[index].source === 'osm_qlever') {
    assert.deepEqual(next[index], connectionGeometry(after[index], () => null));
    utilityVerticesBefore += before[index].coordinates?.length || 0;
    utilityVerticesAfter += after[index].coordinates?.length || 0;
    utilityRoutesChanged += Number(!isDeepStrictEqual(before[index].coordinates, after[index].coordinates));
  } else assert.deepEqual(next[index], previous[index]);
}
const warmStart = performance.now();
for (let pass = 0; pass < 10; pass += 1) after.forEach((link, index) => {
  assert.equal(resolve(link, () => null), next[index]);
});
const warmMs = performance.now() - warmStart;
const select = createViewportGeometrySelector();
const mostBranched = next.filter(geometry => geometry?.type === 'MultiLineString')
  .reduce((largest, geometry) => !largest || geometry.coordinates.length > largest.coordinates.length ? geometry : largest, null);
const [detailLng, detailLat] = mostBranched.coordinates[Math.floor(mostBranched.coordinates.length / 2)][0];
const views = [
  { name: 'Europe overview', west: -25, east: 45, south: 34, north: 72 },
  { name: 'central Spain detail', west: -4.5, east: -3.1, south: 39.6, north: 40.9 },
  { name: 'western Norway detail', west: 5, east: 8, south: 60, north: 62 },
  { name: 'local view within most-branched river', west: detailLng - 0.02, east: detailLng + 0.02, south: detailLat - 0.02, north: detailLat + 0.02 },
];
const viewportChecks = views.map(view => {
  const started = performance.now();
  const selections = next.map(geometry => select(geometry, view));
  const selectionMs = performance.now() - started;
  let beforePaths = 0; let afterPaths = 0; let beforeVertices = 0; let afterVertices = 0;
  next.forEach((geometry, index) => {
    if (geometry?.type !== 'MultiLineString') return;
    if (geometryIntersectsViewport(geometry, view)) {
      beforePaths += geometry.coordinates.length;
      beforeVertices += geometry.coordinates.reduce((sum, path) => sum + path.length, 0);
    }
    // Independent per-path geometry oracle, not the selector's cached index.
    const expected = geometry.coordinates.filter(coordinates => geometryIntersectsViewport(
      connectionGeometry({ coordinates }, () => null), view));
    const selected = selections[index];
    assert.deepEqual(selected?.coordinates || [], expected);
    assert.equal(select(geometry, { ...view }), selected);
    afterPaths += expected.length;
    afterVertices += expected.reduce((sum, path) => sum + path.length, 0);
  });
  return { view, beforePaths, afterPaths, beforeVertices, afterVertices, selectionMs,
    every_intersecting_source_path_retained: true };
});
console.log(JSON.stringify({ links: after.length, unmapped_before: previous.filter(value => !value).length,
  unmapped_after: next.filter(value => !value).length, restored_links: restored,
  drawable_paths: paths, drawable_vertices: vertices, geometry_preparation_ms: coldMs,
  ten_cached_passes_ms: warmMs, viewportChecks,
  source_path_bounds_bytes: next.reduce((sum, geometry) => sum + (geometry?.pathBounds?.byteLength || 0), 0),
  utilityVerticesBefore, utilityVerticesAfter, utilityRoutesChanged,
  scope: 'Node geometry preparation, not browser rendering or ordinary-laptop certification' }));
