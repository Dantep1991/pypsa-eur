import { atlasApiUrl } from '../config/api';
import { validatedResultRows } from './resultScene';
import { subtractReverseFlow } from './annualFlow';
import { flowPeriodMetrics } from './flowPeriodMetrics';
export { compatibleFlowLimit, flowUtilisation } from './flowPeriodMetrics';

// Structured PLEXOS connection/property contracts, not language-intent routing.
export function flowMetricContract(quantity = {}) {
  const classKey = String(quantity.class_name || '').replace(/\s/g, '').toLowerCase();
  const property = quantity.property_name;
  if (classKey === 'line' && ['Flow', 'Net Flow', 'Flow Back'].includes(property)) {
    return { className: 'Line', direction: property === 'Flow Back' ? -1 : 1 };
  }
  if (classKey === 'gaspipeline' && ['Flow In', 'Flow Out', 'Flow', 'Net Flow'].includes(property)) {
    return { className: 'Gas Pipeline', direction: 1 };
  }
  return null;
}

export const FLOW_RESOLUTIONS = ['hour', 'day', 'week', 'month', 'year'];
export const flowResolutionLabel = value => ({ hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Annual' }[value] || value);

export function flowQualityReport(quality, selection) {
  if (!quality) return null;
  if (quality.schema !== 'nohm.results.quality.v1' || !['reject', 'exclude_entities'].includes(quality.policy)
    || !Number.isInteger(quality.conflicted_entity_count) || quality.conflicted_entity_count < 0
    || !Number.isInteger(quality.excluded_entity_count) || quality.excluded_entity_count < 0
    || quality.excluded_entity_count > quality.conflicted_entity_count || quality.source_data_changed !== false
    || (quality.policy === 'exclude_entities' && quality.excluded_entity_count !== quality.conflicted_entity_count)
    || (quality.policy === 'reject' && quality.excluded_entity_count !== 0)
    || !Array.isArray(quality.conflicts) || quality.conflicts.some(item => item.run_id !== selection.runId
      || typeof item.entity_name !== 'string' || !Array.isArray(item.periods)
      || item.periods.some(period => typeof period.timestamp !== 'string' || typeof period.unit !== 'string'
        || !Array.isArray(period.observations) || period.observations.some(item => !Number.isFinite(item.value) || typeof item.source_file !== 'string')))) {
    throw new Error('Invalid or foreign flow quality report.');
  }
  return quality;
}

export function adaptLolaFlowRows(payload, topology, context, selection) {
  if (topology.schema !== 'nohm.atlas.flow-topology.v1' || topology.project_id !== context.projectId
    || topology.model_version !== selection.modelVersion || topology.class_name !== selection.className) {
    throw new Error('Flow topology is not bound to this exact project, version and class.');
  }
  const quality = flowQualityReport(payload.quality, selection);
  if (!payload.rows?.length && quality?.excluded_entity_count) {
    const error = new Error('No valid observations remain after excluding disputed objects. No zero flows were generated.');
    error.quality = quality;
    throw error;
  }
  const rows = validatedResultRows(payload, context, selection);
  const excludedNames = new Set(quality?.policy === 'exclude_entities' ? quality.conflicts.map(item => item.entity_name) : []);
  if (rows.some(row => excludedNames.has(row.entity_name || row.group_value))) throw new Error('A disputed flow object remains in the valid-record response.');
  const contract = flowMetricContract({ class_name: selection.className, property_name: selection.propertyName });
  if (!contract) throw new Error('This quantity has no declared directional-flow contract.');
  const topologyByName = new Map(topology.lines.map(line => [line.name, line]));
  if (topologyByName.size !== topology.lines.length) throw new Error('Flow topology contains ambiguous object identities.');
  const seen = new Set(), units = new Set(), periods = new Set(), series = new Map();
  for (const row of rows) {
    const name = String(row.entity_name || row.group_value || '').trim();
    const period = String(row.time_bucket || '').trim();
    const value = Number(row.value);
    if (!name || !period || row.value == null || row.value === '' || !Number.isFinite(value)) throw new Error('Flow rows require an object, timestamp and finite value.');
    if (!Number.isFinite(Date.parse(period))) throw new Error('Flow rows contain an invalid timestamp.');
    if (row.class_name && String(row.class_name).replace(/\s/g, '') !== selection.className.replace(/\s/g, '')) throw new Error('Flow rows contain another connection class.');
    if (row.property_name && row.property_name !== selection.propertyName) throw new Error('Flow rows contain another quantity.');
    const key = `${name}\u0000${period}`;
    if (seen.has(key)) throw new Error('Flow rows contain duplicate object periods.');
    seen.add(key);
    units.add(String(row.unit_name || selection.unit || ''));
    if (selection.unit && row.unit_name && row.unit_name !== selection.unit) throw new Error('The reported unit disagrees with the selected flow quantity.');
    periods.add(period);
    const line = topologyByName.get(name);
    if (!line) continue; // Never substitute a parallel link with the same endpoints.
    if ((row.from_node && row.from_node !== line.from_node) || (row.to_node && row.to_node !== line.to_node)) {
      throw new Error('A result endpoint disagrees with its exact model-schema membership.');
    }
    const item = series.get(line.id) || { ...line, values: new Map() };
    item.values.set(period, value);
    series.set(line.id, item);
  }
  if (units.size > 1) throw new Error('Flow rows contain incompatible physical units.');
  if (!rows.length) throw new Error('No reported flows exist at this resolution and date range.');
  const lines = [...series.values()];
  const mapped = lines.filter(line => line.coordinates?.length >= 2);
  return {
    lines, periods: [...periods].sort((a, b) => Date.parse(a) - Date.parse(b)),
    unit: [...units][0] || selection.unit, direction: contract.direction, selection, quality,
    maximum: mapped.reduce((max, line) => [...line.values.values()].reduce((limit, value) => Math.max(limit, Math.abs(value)), max), 0),
    coverage: { rows: rows.length, objects: new Set(rows.map(row => row.entity_name || row.group_value)).size,
      matched: lines.length, mapped: mapped.length, unmapped: lines.length - mapped.length,
      unmatched: new Set(rows.map(row => row.entity_name || row.group_value)).size - lines.length },
  };
}

export function lolaFlowFrame(scene, period, selectedId = '', color = 'currentColor') {
  if (!scene) return { lines: [], period: '', selectedId };
  const lines = scene.lines.flatMap(line => {
    const value = line.values.get(period);
    if (value == null || line.coordinates.length < 2 || !line.from_node || !line.to_node) return [];
    const reverse = value * scene.direction < 0;
    const metrics = flowPeriodMetrics(line, value, scene.unit, scene.selection.granularity, scene.direction, period);
    return [{ ...line, value, magnitude: Math.abs(value),
      coordinates: reverse ? [...line.coordinates].reverse() : line.coordinates,
      actualFrom: reverse ? line.to_node : line.from_node,
      actualTo: reverse ? line.from_node : line.to_node,
      color, unit: scene.unit, period, maximum: scene.maximum, metrics,
      annual: scene.selection.granularity === 'year', net: scene.selection.propertyName === 'Net Flow' }];
  });
  return { lines, period, selectedId };
}

export function selectedFlowSamples(scene, lineId) {
  const line = scene?.lines.find(item => item.id === lineId);
  return line ? scene.periods.map(period => ({ period, value: line.values.get(period) ?? null })) : [];
}

export async function fetchLolaFlowTopology(context, selection, options = {}, fetchImpl = window.fetch.bind(window)) {
  const query = new URLSearchParams({ version: selection.modelVersion, class_name: selection.className });
  if (/^\d{4}$/.test(selection.period)) query.set('year', selection.period);
  const response = await fetchImpl(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(context.projectId)}/flow-topology?${query}`, options.apiBase),
    { credentials: 'same-origin', signal: options.signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : `Flow topology failed: HTTP ${response.status}`);
  if (payload.project_id !== context.projectId || payload.model_version !== selection.modelVersion || payload.class_name !== selection.className) {
    throw new Error('Flow topology is not bound to this exact project, version and class.');
  }
  return payload;
}

export async function fetchLolaFlowScene(context, selection, options = {}, fetchImpl = window.fetch.bind(window)) {
  const conflictPolicy = options.conflictPolicy || 'reject';
  if (!['reject', 'exclude_entities'].includes(conflictPolicy)) throw new Error('Unsupported flow conflict policy.');
  if (!selection.runId || selection.runModelVersion !== selection.modelVersion || !flowMetricContract({ class_name: selection.className, property_name: selection.propertyName })) {
    throw new Error('Choose a supported flow quantity from a run bound to the loaded model version.');
  }
  if (!selection.availableGranularities?.includes(selection.granularity)) throw new Error('That time resolution is not reported for this quantity.');
  if (selection.dateFrom && selection.dateTo && Date.parse(selection.dateFrom) > Date.parse(selection.dateTo)) throw new Error('The flow date range is reversed.');
  const read = async (url, init) => {
    const response = await fetchImpl(atlasApiUrl(url, options.apiBase), { credentials: 'same-origin', signal: options.signal, ...init });
    const payload = await response.json();
    if (!response.ok) {
      const detail = payload.detail;
      const error = new Error(typeof detail === 'string' ? detail : detail?.message || `Flow request failed: HTTP ${response.status}`);
      if (detail?.code === 'result_observation_conflict') {
        error.quality = flowQualityReport(detail.quality, selection);
        error.code = detail.code;
      }
      throw error;
    }
    return payload;
  };
  options.onProgress?.({ phase: 'topology', completed: 0, total: 3 });
  const topology = options.topology || await fetchLolaFlowTopology(context, selection, options, fetchImpl);
  const requestedNames = options.entityNames;
  if (requestedNames && (!requestedNames.length || requestedNames.some(name => !topology.lines.some(line => line.name === name)))) {
    throw new Error('Choose exact connections present in this model topology.');
  }
  options.onProgress?.({ phase: 'query', completed: 1, total: 3 });
  const query = { run_ids: [selection.runId], report_family: selection.reportFamily,
      class_name: selection.className, property_name: selection.derivedNetFlow ? 'Flow' : selection.propertyName,
      granularity: selection.granularity, group_by: 'line', aggregation_method: 'auto', quantity_aware_aggregation: true,
      observation_conflict_policy: conflictPolicy,
      entity_names: requestedNames || (selection.category ? (topology.lines.filter(line => line.category === selection.category).map(line => line.name).length
        ? topology.lines.filter(line => line.category === selection.category).map(line => line.name) : ['__atlas_no_schema_objects__']) : []),
      date_from: selection.dateFrom || (/^\d{4}$/.test(selection.period) ? `${selection.period}-01-01` : undefined),
      date_to: selection.dateTo ? `${selection.dateTo}T23:59:59` : (/^\d{4}$/.test(selection.period) ? `${selection.period}-12-31T23:59:59` : undefined),
      limit: 150000, use_cache: true, cache_mode: 'prefer' };
  const queryResult = body => read(`/api/solutions/${encodeURIComponent(context.projectId)}/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (selection.derivedNetFlow && (selection.className !== 'Line' || selection.propertyName !== 'Net Flow' || selection.granularity !== 'year')) {
    throw new Error('Only annual Line net flow can be derived from forward and reverse energy.');
  }
  const payload = await queryResult(query);
  // History may include genuinely unreported windows. Preserve the warning,
  // never manufacture zero rows or relax normal map-load validation.
  if (options.allowEmptyHistoryWindow && payload.project_id === context.projectId
    && payload.query?.run_ids?.length === 1 && payload.query.run_ids[0] === selection.runId
    && payload.query.class_name === selection.className && payload.query.property_name === query.property_name
    && payload.summary?.row_count === 0 && payload.rows?.length === 0 && !payload.quality) {
    validatedResultRows({...payload,missing_runs:[]},context,selection);
    return {selection,lines:[],periods:[],unit:selection.unit,direction:selection.propertyName==='Flow Back'?-1:1,
      warnings:[`${query.date_from} – ${query.date_to}: ${payload.missing_runs?.map(item=>item.reason).join(' ') || 'No observations were returned.'}`]};
  }
  if (conflictPolicy === 'exclude_entities' && payload.quality?.policy !== 'exclude_entities') {
    throw new Error('The server did not confirm valid-record exclusion. The previous view is unchanged.');
  }
  options.onProgress?.({ phase: 'projection', completed: 2, total: 3 });
  let scene = adaptLolaFlowRows(payload, topology, context, { ...selection, propertyName: query.property_name });
  if (selection.derivedNetFlow) {
    options.onProgress?.({ phase: 'reverse energy', completed: 2, total: 3 });
    const back = await queryResult({ ...query, property_name: 'Flow Back' });
    if (conflictPolicy === 'exclude_entities' && back.quality?.policy !== 'exclude_entities') throw new Error('The server did not confirm reverse-energy exclusion.');
    const reverse = adaptLolaFlowRows(back, topology, context, { ...selection, propertyName: 'Flow Back' });
    // Do not hide disputes in one operand behind an apparently clean net value.
    if (scene.quality?.excluded_entity_count || reverse.quality?.excluded_entity_count) throw new Error('Resolve disputed forward/reverse records before deriving annual net flow.');
    scene = subtractReverseFlow(scene, reverse, selection);
  }
  // Read the actual run's limits: model inputs may contain datafile/scenario
  // references and cannot safely be interpreted as constant capacities.
  if (selection.className === 'Line' && selection.limitProperties?.length) {
    const byName = new Map(scene.lines.map(line => [line.name, line]));
    scene.lines.forEach(line => { line.reportedLimits = new Map(); });
    for (const property of selection.limitProperties) {
      options.onProgress?.({ phase: property, completed: 2, total: 3 });
      const limits = await read(`/api/solutions/${encodeURIComponent(context.projectId)}/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_ids: [selection.runId], report_family: selection.reportFamily,
          class_name: selection.className, property_name: property, granularity: selection.granularity,
          group_by: 'line', entity_names: [...byName.keys()], aggregation_method: 'mean',
          quantity_aware_aggregation: true, date_from: query.date_from,
          date_to: query.date_to, limit: 150000, use_cache: false }),
      });
      const seenLimits = new Set();
      for (const row of validatedResultRows(limits, context, selection)) {
        if (row.property_name !== property || row.class_name !== selection.className || row.unit_name !== 'MW') {
          throw new Error('Reported capacity limits do not match the requested class, quantity or MW unit.');
        }
        const identity = `${row.entity_name || row.group_value}\u0000${row.time_bucket}`;
        if (seenLimits.has(identity)) throw new Error('Reported limits contain duplicate object periods.');
        seenLimits.add(identity);
        const line = byName.get(row.entity_name || row.group_value);
        if (!line || !Number.isFinite(row.value)) continue;
        const reported = line.reportedLimits.get(row.time_bucket) || { unit: row.unit_name };
        if (reported.unit !== row.unit_name) throw new Error('Reported limits contain incompatible units.');
        reported[property === 'Export Limit' ? 'forward' : 'reverse'] = Math.abs(row.value);
        line.reportedLimits.set(row.time_bucket, reported);
      }
    }
  }
  options.onProgress?.({ phase: 'ready', completed: 3, total: 3 });
  return scene;
}
