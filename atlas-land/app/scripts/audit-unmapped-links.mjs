// Read-only diagnostic against the running local Atlas API. No server restart,
// source changes, inferred routes or browser state access.
// node scripts/audit-unmapped-links.mjs [--countries=BE,ES,FR] [--level=nuts3]
import assert from 'node:assert/strict';
import { connectionGeometry } from '../src/atlasMapGeometry.js';
import { filterOverlayRecordsByCountries } from '../src/atlasNetworkOverlay.js';

const root = 'http://127.0.0.1:5001';
const level = process.argv.find(arg => arg.startsWith('--level='))?.slice(8) || 'nuts3';
assert(['bidding_zone', 'ehighway', 'nuts1', 'nuts2', 'nuts3'].includes(level), 'Unsupported geographic level');
const requested = process.argv.find(arg => arg.startsWith('--countries='))?.slice(12);
assert(!requested || /^[A-Z]{2}(,[A-Z]{2})*$/.test(requested), 'Use comma-separated uppercase ISO2 codes');
async function json(path, body) {
  const response = await fetch(`${root}${path}`, { signal: AbortSignal.timeout(60000),
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  assert(response.ok, `${path.split('?')[0]} returned HTTP ${response.status}`);
  return response.json();
}
const catalogue = await json('/api/pypsa/list-files');
const files = catalogue.files.filter(file => file.geographic_level === level
  && (!requested || requested.split(',').includes(file.geographic_country)));
const countries = [...new Set(files.map(file => file.geographic_country))].sort();
assert(countries.length, 'No country caches available');
if (requested) assert.deepEqual(countries, [...new Set(requested.split(','))].sort(), 'Missing requested caches');
const power = { facilities: [], connections: [] };
for (let i = 0; i < files.length; i += 3) {
  const batch = await Promise.all(files.slice(i, i + 3).map(async file => {
    const payload = await json('/api/pypsa/parse-nc', { filename: file.filename,
      geographic_country: file.geographic_country, geographic_level: level,
      component_scope: 'grid', demand_scenario: 'NT', demand_year: 2030,
      ...(catalogue.capabilities?.parse_nc_omit_geojson_overlays === true ? { include_geojson_overlays: false } : {}) });
    return { facilities: Object.values(payload.markers || {}).map(record => ({ ...record, sourceCountryCode: file.geographic_country })),
      connections: (payload.connections || []).map(record => ({ ...record, sourceCountryCode: file.geographic_country })) };
  }));
  for (const payload of batch) {
    power.facilities.push(...payload.facilities);
    power.connections.push(...payload.connections);
  }
}
const sources = { electricity: power };
for (const carrier of ['gas', 'water']) {
  const payload = await json(`/api/atlas/${carrier}/network?domains=Grid&countries=${countries.join(',')}`);
  sources[carrier] = filterOverlayRecordsByCountries(payload.facilities, payload.connections, countries);
}
const key = value => String(value || '').toUpperCase().trim();
const clean = value => key(value).replace(/[-_]/g, '');
const lookup = new Map();
for (const { facilities } of Object.values(sources)) for (const node of facilities) {
  for (const field of ['id', 'name']) if (key(node[field])) {
    lookup.set(key(node[field]), node); lookup.set(clean(node[field]), node);
  }
  if (key(node.cluster_id) && !lookup.has(key(node.cluster_id))) {
    lookup.set(key(node.cluster_id), node); lookup.set(clean(node.cluster_id), node);
  }
}
const resolve = id => lookup.get(key(id)) || lookup.get(clean(id));
const number = value => value == null || typeof value === 'boolean' || String(value).trim() === '' ? NaN : Number(value);
const valid = point => Array.isArray(point) && Number.isFinite(number(point[0])) && Number.isFinite(number(point[1]))
  && Math.abs(number(point[0])) <= 180 && Math.abs(number(point[1])) <= 90;
const results = [];
for (const [carrier, source] of Object.entries(sources)) {
  const counts = {}; const examples = {};
  let drawable = 0;
  for (const link of source.connections) {
    if (connectionGeometry(link, resolve)) { drawable += 1; continue; }
    const route = (Array.isArray(link.coordinates) ? link.coordinates : []).filter(valid);
    const from = resolve(link.from); const to = resolve(link.to);
    const reason = route.length >= 2 ? 'coincident_source_route'
      : !from || !to ? 'missing_endpoint'
        : !valid([from.longitude, from.latitude]) || !valid([to.longitude, to.latitude]) ? 'invalid_endpoint_coordinates'
          : 'coincident_endpoints';
    counts[reason] = (counts[reason] || 0) + 1;
    examples[reason] ||= [];
    if (examples[reason].length < 5) examples[reason].push({ id: link.id, name: link.name,
      country: link.sourceCountryCode || link.country_codes || link.country,
      from: link.from, to: link.to, routePoints: link.coordinates?.length || 0,
      validRoutePoints: route.length, routeEnds: route.length ? [route[0], route.at(-1)] : [],
      endpoints: [from, to].map(node => node ? { id: node.id, name: node.name,
        longitude: node.longitude, latitude: node.latitude } : null),
      source: link.source || link.source_dataset || link.data_source, capacity: link.s_nom ?? link.capacity });
  }
  assert.equal(drawable + Object.values(counts).reduce((sum, count) => sum + count, 0), source.connections.length);
  results.push({ carrier, facilities: source.facilities.length, links: source.connections.length,
    drawable, unmapped: source.connections.length - drawable, reasons: counts, examples });
}
console.log(JSON.stringify({ api: root, level, countries, scope: 'Grid geometry only; no viewport clipping or inferred source repairs', results }, null, 2));
