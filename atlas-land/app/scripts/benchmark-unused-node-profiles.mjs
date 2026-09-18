// Read-only retained-allocation benchmark, NOT browser/laptop certification.
// node --expose-gc scripts/benchmark-unused-node-profiles.mjs --countries=FR,ES,BE
// Reads each domain of full-resolution country caches, just as the lazy UI does.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

/**
 * Generate a representative 24-hour capacity-factor profile for a given carrier.
 * Returns 8 data points (every 3 hours: 00:00 → 21:00).
 * Values are 0–100 (percentage of installed capacity).
 */
const legacyCarrierProfile = (carrier, p_max_pu = 1) => {
  const c = (carrier || '').toLowerCase();
  const labels = ['00h', '03h', '06h', '09h', '12h', '15h', '18h', '21h'];

  let raw;
  if (c === 'solar') {
    raw = [0, 0, 0.03, 0.48, 0.93, 0.80, 0.22, 0.01];
  } else if (c === 'onwind') {
    raw = [0.42, 0.45, 0.48, 0.38, 0.30, 0.34, 0.42, 0.44];
  } else if (c.includes('offwind')) {
    raw = [0.52, 0.56, 0.58, 0.50, 0.43, 0.47, 0.53, 0.55];
  } else if (c === 'nuclear') {
    const v = (typeof p_max_pu === 'number' && isFinite(p_max_pu) ? p_max_pu : 0.85);
    raw = Array(8).fill(v);
  } else if (c === 'biomass') {
    raw = Array(8).fill(0.82);
  } else if (c === 'coal') {
    raw = Array(8).fill(0.87);
  } else if (c === 'lignite') {
    raw = Array(8).fill(0.80);
  } else if (c === 'ccgt' || c === 'gas' || c.includes('gas')) {
    raw = [0.48, 0.38, 0.33, 0.54, 0.76, 0.82, 0.70, 0.52];
  } else if (c === 'ocgt') {
    raw = [0.08, 0.04, 0.04, 0.12, 0.44, 0.48, 0.32, 0.12];
  } else if (c === 'oil') {
    raw = Array(8).fill(0.28);
  } else if (c === 'hydro' || c.includes('hydro')) {
    raw = [0.55, 0.52, 0.50, 0.58, 0.65, 0.68, 0.60, 0.56];
  } else if (c === 'ror') {
    raw = [0.45, 0.44, 0.43, 0.47, 0.50, 0.52, 0.48, 0.46];
  } else if (c.includes('battery') || c.includes('storage')) {
    raw = [0.70, 0.60, 0.30, 0.10, 0.20, 0.50, 0.80, 0.75];
  } else if (c === 'h2' || c.includes('hydrogen')) {
    raw = [0.35, 0.30, 0.28, 0.38, 0.55, 0.58, 0.45, 0.38];
  } else {
    const v = typeof p_max_pu === 'number' && isFinite(p_max_pu) && p_max_pu > 0 ? p_max_pu : 1;
    raw = Array(8).fill(v);
  }

  return labels.map((time, i) => ({ time, cf: Math.round(raw[i] * 100) }));
};

const countries = (process.argv.find(arg => arg.startsWith('--countries='))?.split('=')[1] || 'FR').split(',');
if (!countries.every(country => /^[A-Z]{2}$/.test(country))) throw new Error('Use ISO2 country codes');
if (!global.gc) throw new Error('Run with --expose-gc for retained heap measurements');
const source = [];
for (const country of [...new Set(countries)]) {
 for (const scope of ['grid', 'supply', 'storage', 'demand']) {
  const response = await fetch('http://127.0.0.1:5001/api/pypsa/parse-nc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ filename: `base_${country}_full.nc`, full_country: country,
      component_scope: scope, demand_scenario: 'NT', demand_year: 2030 }),
  });
  if (!response.ok) throw new Error(`${country}: HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error || payload.source_inventory?.error || payload.demand_inventory?.error) throw new Error(`${country}: source data unavailable`);
  if (payload.component_scope !== scope) throw new Error(`${country}: unexpected component scope`);
  const markers = Array.isArray(payload.markers) ? payload.markers : Object.values(payload.markers || {});
  source.push({ country, scope, markers, links: payload.connections?.length || 0 });
 }
}
// Reproduce only the deleted field's incremental allocations, not the whole
// facility adapter. Existing raw data stays resident for both measurements.
const markers = source.flatMap(row => row.markers).filter(marker => !marker.is_virtual);
const samples = [];
let retained;
for (let i = 0; i < 7; i += 1) {
  retained = null;
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  retained = markers.map(marker => legacyCarrierProfile(marker.carrier || marker.type || 'unknown',
    typeof marker.p_max_pu === 'number' ? marker.p_max_pu : undefined));
  const elapsedMs = performance.now() - start;
  assert(retained.every(profile => profile.length === 8));
  global.gc();
  samples.push({ retainedHeapBytes: process.memoryUsage().heapUsed - before, elapsedMs });
}
const median = key => samples.map(sample => sample[key]).sort((a,b)=>a-b)[3];
console.log(JSON.stringify({
  scope: 'incremental unused profile arrays/point objects only; excludes HTTP, parsing, rest of adapter, React and Leaflet',
  source: source.map(row => ({country:row.country, componentScope:row.scope, resolution:'full', markers:row.markers.length, links:row.links})),
  nonVirtualNodes: markers.length, removedProfileArrays: markers.length, removedPointObjects: markers.length * 8,
  samples: 7, medianAvoidedRetainedHeapBytes: median('retainedHeapBytes'),
  medianAvoidedAllocationMs: median('elapsedMs'), noReplacementProfileAllocation: true,
}, null, 2));
