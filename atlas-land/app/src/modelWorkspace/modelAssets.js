import { atlasApiUrl } from '../config/api';
import { adaptVisualisationCatalog, validatedResultRows } from './resultScene';
import { validateAssetOutputProvenance } from './assetOutputContract';

export const assetClassKey = value => String(value || '').replace(/\s/g, '').toLowerCase();

export async function readAssetApi(path, options = {}, fetchImpl = window.fetch.bind(window)) {
  const { apiBase, timeoutMs, signal, ...requestOptions } = options;
  const controller = new AbortController();
  let timer, rejectCancelled;
  const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
  const abort = () => {
    controller.abort();
    rejectCancelled(new DOMException('Model data loading cancelled', 'AbortError'));
  };
  if (signal?.aborted) throw new DOMException('Model data loading cancelled', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) timer = setTimeout(() => {
    // Reject even when a transport ignores abort; late responses cannot publish.
    // A distinct name, so a retry can tell the client timer from a service error that mentions a timeout.
    rejectCancelled(Object.assign(new Error('Model data request timed out. Please try again.'), { name: 'TimeoutError' }));
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([cancelled, (async () => {
      const response = await fetchImpl(atlasApiUrl(path, apiBase), {
        credentials: 'same-origin', ...requestOptions, signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : `Model database request failed (${response.status}).`);
      return payload;
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function assetPath(projectId, suffix, params) {
  return `/api/atlas/projects/${encodeURIComponent(projectId)}/assets${suffix}?${new URLSearchParams(params)}`;
}

export function validateAssetBinding(payload, projectId, version) {
  if (payload.project_id !== projectId || payload.model_version !== version) throw new Error('Model database response belongs to another project or version.');
  return payload;
}

const numericValue = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));

export function validateAssetWindow(from, to, granularity) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to)) throw new Error('Choose valid start and end dates.');
  if (from > to) throw new Error('The output date range is reversed.');
  if (granularity === 'hour' && Date.parse(to) - Date.parse(from) >= 31 * 86400000) throw new Error('Choose an hourly window of at most 31 days.');
}

function bucketStart(value, granularity) {
  const date = new Date(value);
  if (granularity === 'hour') return date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(0, 0, 0, 0);
  if (granularity === 'week') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  if (granularity === 'month') date.setUTCDate(1);
  if (granularity === 'year') date.setUTCMonth(0, 1);
  return date.getTime();
}

export function inputAssetValues(payload) {
  // A database row is not an evaluated input. Conditional/datafile/banded rows
  // stay inspectable but are never silently summed or treated as constants.
  return new Map(payload.objects.map(obj => {
    const records = obj.records || [];
    if (payload.resolution_contract === 'nohm.modelling.input-snapshot.v1') {
      const resolved = obj.resolution || {};
      const valid = resolved.status === 'resolved' && numericValue(resolved.value);
      return [obj.id, { ...resolved, value: valid ? Number(resolved.value) : null, records,
        unit: resolved.unit || '', note: valid ? '' : resolved.note || 'Input could not be resolved.' }];
    }
    const row = records[0];
    const dynamic = row && ['Scenario', 'Data_x0020_File', 'Data File', 'Expression', 'Timeslice',
      'Date_x0020_From', 'Date_x0020_To', 'Date From', 'Date To', 'Action'].some(key => row[key]);
    const numeric = row && numericValue(row.Value);
    const value = records.length === 1 && !dynamic && (!row.Band || Number(row.Band) === 1) && numeric ? Number(row.Value) : null;
    return [obj.id, { value, unit: row?.Units || '', records,
      note: !records.length ? 'Not specified' : value == null ? `${records.length} contextual input record${records.length === 1 ? '' : 's'}` : '' }];
  }));
}

export function assetOutputSeries(payload, objects, context, selection) {
  validateAssetOutputProvenance(payload, context, selection);
  const rows = validatedResultRows(payload, context, selection);
  const byName = new Map();
  objects.forEach(obj => {
    if (byName.has(obj.name)) throw new Error('Model class has ambiguous object names; outputs cannot be joined safely.');
    byName.set(obj.name, obj);
  });
  const series = new Map(), periods = new Set(), seen = new Set(), units = new Set();
  let unmatched = 0;
  for (const row of rows) {
    if (assetClassKey(row.class_name) !== assetClassKey(selection.className) || row.property_name !== selection.propertyName) throw new Error('Outputs contain another class or property.');
    const name = row.entity_name || row.group_value;
    const stamp = row.time_bucket;
    if (!stamp || !Number.isFinite(Date.parse(stamp)) || !numericValue(row.value)) throw new Error('Outputs require finite values and a valid timestamp.');
    if (!String(row.unit_name || '').trim() || (selection.unit && row.unit_name !== selection.unit)) throw new Error('Output units disagree with the selected quantity.');
    if (selection.reportFamily && row.report_family !== selection.reportFamily) throw new Error('Outputs contain another report family.');
    if (selection.dateFrom && selection.dateTo) {
      const bucket = bucketStart(stamp, selection.granularity);
      const start = bucketStart(selection.dateFrom, selection.granularity);
      const end = bucketStart(`${selection.dateTo}T23:59:59Z`, selection.granularity);
      if (bucket < start || bucket > end) throw new Error('Outputs contain periods outside the requested window.');
    }
    const identity = JSON.stringify([name, stamp]);
    if (seen.has(identity)) throw new Error('Duplicate output records cannot be mapped safely.');
    seen.add(identity); units.add(row.unit_name || ''); periods.add(stamp);
    const obj = byName.get(name);
    if (!obj) { unmatched += 1; continue; }
    if (!series.has(stamp)) series.set(stamp, new Map());
    series.get(stamp).set(obj.id, { value: Number(row.value), unit: row.unit_name || '', note: '', records: [] });
  }
  if (units.size > 1) throw new Error('Outputs contain incompatible units.');
  if (!rows.length) throw new Error('No reported values for this selection.');
  return { series, periods: [...periods].sort(), unmatched, unit: [...units][0] };
}

export function modelAssetFrame(objects, values = new Map(), label = '', selectedId = '', measurementMode = false) {
  const groups = new Map();
  for (const obj of objects) {
    for (const node of obj.nodes) {
      const p = node.position;
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      const key = JSON.stringify([p.lat, p.lon]);
      const group = groups.get(key) || { id: key, position: [p.lat, p.lon], nodes: [], objects: [], maximum: 0 };
      if (!group.nodes.some(item => item.id === node.id)) group.nodes.push(node);
      const measurement = values.get(obj.id);
      if (!group.objects.some(item => item.id === obj.id)) group.objects.push({ ...obj, measurement });
      if (Number.isFinite(measurement?.value)) group.maximum = Math.max(group.maximum, Math.abs(measurement.value));
      groups.set(key, group);
    }
  }
  const markers = [...groups.values()].map(marker => ({ ...marker,
    measured: marker.objects.filter(obj => Number.isFinite(obj.measurement?.value)).length }));
  const units = new Set(markers.flatMap(marker => marker.objects)
    .filter(obj => Number.isFinite(obj.measurement?.value)).map(obj => obj.measurement.unit || ''));
  const maximum = markers.reduce((max, marker) => Math.max(max, marker.maximum), 0);
  return { markers, maximum, label, selectedId, measurementMode: measurementMode || values.size > 0,
    hasValues: units.size === 1, incompatibleUnits: units.size > 1 };
}

export async function fetchAssetOutputsCatalog(projectId, version, className, signal, onProgress = () => {}) {
  const runs = await readAssetApi(`/api/solutions/${encodeURIComponent(projectId)}/runs?discovery=registered`, { signal });
  const eligible = (runs.runs || []).filter(run => (run.schema_version_id || run.model_version_id || run.version_hint) === version);
  const entries = [];
  for (const [index, run] of eligible.entries()) {
    onProgress(`Reading ${className} outputs · run ${index + 1} of ${eligible.length} · ${run.display_name || run.run_id}`);
    const catalog = await readAssetApi(`/api/solutions/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(run.run_id)}/catalog?compact=true&class_name=${encodeURIComponent(className)}`, { signal });
    if (catalog.run_id !== run.run_id) throw new Error('The output catalogue returned another result run.');
    const adapted = adaptVisualisationCatalog({ runs: [run] }, catalog, projectId, version).runs[0];
    adapted.quantities = adapted.quantities.filter(q => assetClassKey(q.class_name) === assetClassKey(className))
      .map(q => ({ ...q, id: `${q.report_family}:${q.id}` }));
    if (adapted.compatible && adapted.quantities.length) entries.push(adapted);
  }
  return entries;
}
