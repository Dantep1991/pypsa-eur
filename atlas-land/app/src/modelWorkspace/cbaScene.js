import { fetchResultTopology } from './resultAssetProjection';
import { atlasApiUrl } from '../config/api';

export const CBA_COMPONENTS = [
  { id: 'total', label: 'Total value · Δ system costs', keys: [] },
  { id: 'consumer', label: 'Consumer rents', keys: ['cs_elec', 'cs_h2'] },
  { id: 'producer', label: 'Producer rents', keys: ['ps_elec', 'ps_h2'] },
  { id: 'congestion', label: 'Congestion rents', keys: ['cr_elec', 'cr_h2'] },
  { id: 'cross_sectoral', label: 'Cross-sectoral rents', keys: ['xsec'] },
];

async function read(path, options, fetchImpl) {
  const response = await fetchImpl(atlasApiUrl(path, options.apiBase), { signal: options.signal });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(typeof payload.detail === 'string' ? payload.detail : `CBA request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function cbaBands(study, caseId) {
  return Object.keys(study?.summary?.tscDelta || {}).filter(band => {
    const value = study.summary.tscDelta[band]?.[caseId]?.total;
    return value != null && Number.isFinite(Number(value));
  });
}

export function cbaComponents(study, caseId, band) {
  const rents = study?.summary?.sewDelta?.[band]?.[caseId] || {};
  return CBA_COMPONENTS.map(item => ({ ...item, available: item.id === 'total' || item.keys.some(key => rents[key] != null && Number.isFinite(Number(rents[key]))) }));
}

export async function fetchCbaStudies(context, options = {}, fetchImpl = fetch) {
  if (context?.mode !== 'model' || !context.projectId) return [];
  let payload = {}, discoveryError;
  try { payload = await read('/api/theo/projects', options, fetchImpl); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    if (error.status !== 404) discoveryError = error;
  }
  const projects = Array.isArray(payload) ? payload : payload.projects || [];
  const linked = projects.filter(item => item.modelProjectId === context.projectId);
  // The catalogue is metadata, not permission to view an assessment. The
  // active project's saved summary is readable even before metadata catches up.
  if (!linked.some(item => item.projectId === context.projectId)) linked.push({
    projectId: context.projectId, modelProjectId: context.projectId, name: context.projectId,
  });
  const failures = [];
  const studies = await Promise.all(linked.map(async item => {
    try {
      const response = await fetchImpl(atlasApiUrl(`/api/theo/projects/${encodeURIComponent(item.projectId)}/cba-summary`, options.apiBase), { signal: options.signal });
      if (response.status === 404) {
        if (item.status === 'Failed' || item.cbaFailure) failures.push(`${item.name || item.projectId}: assessment failed${item.cbaFailure ? ` — ${item.cbaFailure}` : '.'}`);
        return null;
      }
      const summary = await response.json();
      if (!response.ok) throw new Error(typeof summary.detail === 'string' ? summary.detail : `Assessment request failed (${response.status}).`);
      if (summary.status === 'failed') throw new Error(`Assessment failed${summary.error ? `: ${summary.error}` : '.'}`);
      const study = { ...item, name: item.name || summary.name || item.projectId, summary };
      const cases = (summary.projects || []).filter(caseId => cbaBands(study, caseId).length);
      return cases.length ? { ...study, cases } : null;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      failures.push(`${item.name || item.projectId}: ${error.message}`);
      return null;
    }
  }));
  const available = studies.filter(Boolean);
  if (!available.length && (failures.length || discoveryError)) throw new Error(failures.join(' ') || discoveryError.message);
  return available.map(study => ({ ...study, discoveryWarnings: failures }));
}

export function defaultCbaSelection(study) {
  const caseId = study?.cases?.[0] || '';
  return { studyId: study?.projectId || '', caseId, band: cbaBands(study, caseId)[0] || '', component: 'total', map: 'country' };
}

const nameKey = value => String(value || '').trim().toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, '');
const validPoint = point => point?.lat != null && point?.lon != null && Number.isFinite(Number(point.lat))
  && Number.isFinite(Number(point.lon)) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;

export function positionCbaCountries(rows, coordinates) {
  return rows.filter(row => row.value != null && Number.isFinite(Number(row.value)) && validPoint(coordinates[row.country]))
    .map(row => ({ ...row, coordinates: [Number(coordinates[row.country].lon), Number(coordinates[row.country].lat)],
      coordinateSource: coordinates[row.country].source || 'Emil geography database' }));
}

export function positionCbaAssets(rows, topologies) {
  const aliases = new Map();
  for (const topology of topologies) {
    for (const line of topology.lines || []) {
      const keys = new Set([line.name, line.id, `${line.from_node}-${line.to_node}`, `${line.to_node}-${line.from_node}`].map(nameKey));
      for (const key of keys) {
        const bucket = aliases.get(key) || new Map();
        bucket.set(`${topology.class_name}:${line.id}`, { ...line, className: topology.class_name });
        aliases.set(key, bucket);
      }
    }
  }
  return rows.flatMap(row => {
    const candidates = [...(aliases.get(nameKey(row.assetName))?.values() || [])]
      .filter(line => !row.collectionName || line.className === row.collectionName);
    const line = candidates.length === 1 ? candidates[0] : null;
    if (!line || !Array.isArray(line.coordinates) || line.coordinates.length < 2
        || !line.coordinates.every(point => Array.isArray(point) && validPoint({ lon: point[0], lat: point[1] }))
        || row.value == null || !Number.isFinite(Number(row.value))) return [];
    return [{ ...row, id: line.id, className: line.className, from: line.from_node, to: line.to_node,
      coordinates: line.coordinates, coordinateSource: 'Emil model topology / geography database' }];
  });
}

export async function fetchCbaScene(context, study, selection, options = {}, fetchImpl = fetch) {
  options.onProgress?.({ phase: 'Reading Theo assessment', completed: 0, total: 2 });
  const params = new URLSearchParams({ case_id: selection.caseId, band: selection.band, component: selection.component });
  const data = await read(`/api/theo/projects/${encodeURIComponent(study.projectId)}/atlas-cba-map?${params}`, options, fetchImpl);
  if (data.schema !== 'nohm.atlas.cba-map.v1' || data.caseId !== selection.caseId || data.band !== selection.band
      || data.component !== selection.component || data.studyId !== study.projectId) throw new Error('Theo returned a different assessment than requested.');
  options.onProgress?.({ phase: 'Resolving map positions', completed: 1, total: 2 });
  let points = [], lines = [], warnings = [];
  const rows = selection.map === 'country' ? data.countries : data.assets;
  if (rows.length && selection.map === 'country') {
    const query = new URLSearchParams({ ids: [...new Set(rows.map(row => row.country))].join(','), kind: 'country' });
    const geo = await read(`/api/emil/database/coordinates?${query}`, options, fetchImpl);
    points = positionCbaCountries(rows, geo.coordinates || {});
  }
  if (rows.length && selection.map === 'connections') {
    const results = await Promise.all(['Line', 'Gas Pipeline'].map(async className => {
      try {
        return await fetchResultTopology(context, { modelVersion: context.version, className }, options, fetchImpl);
      } catch (error) {
        if (options.signal?.aborted) throw error;
        warnings.push(`${className}: ${error.message}`);
        return null;
      }
    }));
    lines = positionCbaAssets(rows, results.filter(Boolean));
  }
  options.onProgress?.({ phase: 'Map ready', completed: 2, total: 2 });
  return { ...data, selection, sourceProjectId: context.projectId, sourceModelVersion: context.version,
    studyName: study.name || study.projectId, points, lines, warnings,
    coverage: { mapped: points.length + lines.length, reported: rows.length, unmapped: rows.length - points.length - lines.length } };
}
