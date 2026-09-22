import { atlasApiUrl } from '../config/api';

export const MODEL_RESULT_CATALOG_SCHEMA = 'nohm.atlas.result-catalog.v2';
export const MODEL_RESULT_SCENE_SCHEMA = 'nohm.atlas.result-scene.v2';

const text = value => String(value ?? '').trim();
const unique = values => [...new Set((values || []).map(text).filter(Boolean))];

export function modelResultCatalogRequestUrl(context) {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId) return null;
  return `/api/solutions/${encodeURIComponent(projectId)}/runs`;
}

export function modelResultSceneRequestUrl(context) {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId) return null;
  return `/api/solutions/${encodeURIComponent(projectId)}/query`;
}

function modelResultRunCatalogRequestUrl(context, runId) {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId || !text(runId)) return null;
  return `/api/solutions/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(text(runId))}/catalog?compact=true`;
}

async function readJson(response, label) {
  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new Error(`${label} returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `HTTP ${response.status}`;
    throw new Error(`${label}: ${detail}`);
  }
  return payload;
}

function hydrateMetric(metric, payload) {
  const dimensions = payload?.metric_dimension_sets?.[metric?.dimension_set] || {};
  return {
    id: `${text(metric?.class_name)}.${text(metric?.property_name)}`,
    report_family: text(metric?.report_family),
    class_name: text(metric?.class_name),
    property_name: text(metric?.property_name),
    unit: text(metric?.unit_name),
    categories: unique(dimensions.categories),
    countries: unique(dimensions.countries),
    nodes: unique(dimensions.nodes),
    available_granularities: unique(metric?.available_granularities),
    supports_flow_map: Boolean(metric?.supports_flow_map),
  };
}

export function adaptVisualisationCatalog(runsPayload, metricPayload, expectedProjectId = '', modelVersion = '') {
  const projectId = text(metricPayload?.project_id || expectedProjectId);
  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new Error(`Atlas requested ${expectedProjectId} but received results for ${projectId || 'another project'}.`);
  }
  const sourceRuns = Array.isArray(runsPayload?.runs) ? runsPayload.runs : [];
  const quantities = (metricPayload?.metrics || []).map(metric => hydrateMetric(metric, metricPayload));
  const runs = sourceRuns.map(run => {
    const targetYear = text(run?.target_year);
    return {
      ...run,
      label: text(run?.display_name) || text(run?.run_id),
      compatible: Boolean(text(run?.run_id)) && quantities.length > 0,
      periods: targetYear ? [targetYear] : [],
      period_granularity: 'annual',
      quantities: quantities.map(quantity => ({
        ...quantity,
        periods: targetYear ? [targetYear] : [],
      })),
    };
  });
  return {
    schema: MODEL_RESULT_CATALOG_SCHEMA,
    source: 'emil_visualisation_domain',
    project_id: projectId,
    model_version: text(modelVersion),
    runs,
    warnings: [],
  };
}

export function adaptModelResultCatalog(payload, expectedProjectId = '', expectedModelVersion = '') {
  if (!payload || payload.schema !== MODEL_RESULT_CATALOG_SCHEMA) {
    throw new Error('Atlas received an unsupported model-result catalog.');
  }
  if (expectedProjectId && payload.project_id !== expectedProjectId) {
    throw new Error(`Atlas requested ${expectedProjectId} but received results for ${payload.project_id || 'another project'}.`);
  }
  if (expectedModelVersion && payload.model_version && payload.model_version !== expectedModelVersion) {
    throw new Error(`Results target ${payload.model_version || 'another version'}, not loaded model ${expectedModelVersion}.`);
  }
  return {
    ...payload,
    runs: Array.isArray(payload.runs) ? payload.runs : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
  };
}

export function adaptModelResultScene(payload, expectedProjectId = '', expectedModelVersion = '') {
  if (!payload || payload.schema !== MODEL_RESULT_SCENE_SCHEMA) {
    throw new Error('Atlas received an unsupported model-result scene.');
  }
  if (expectedProjectId && payload.project_id !== expectedProjectId) {
    throw new Error(`Atlas requested ${expectedProjectId} but received results for ${payload.project_id || 'another project'}.`);
  }
  if (expectedModelVersion && payload.model_version && payload.model_version !== expectedModelVersion) {
    throw new Error(`Result scene targets ${payload.model_version || 'another version'}, not loaded model ${expectedModelVersion}.`);
  }
  const values = Array.isArray(payload.values) ? payload.values : [];
  const valueByEntityId = new Map(values.map(row => [text(row.entity_id), row]));
  return { ...payload, values, valueByEntityId };
}

export async function fetchModelResultCatalog(context, modelVersion, options = {}, fetchImpl = window.fetch.bind(window)) {
  const runsUrl = modelResultCatalogRequestUrl(context);
  if (!runsUrl) throw new Error('A bound model project is required to load Atlas results.');
  const requestOptions = { signal: options.signal, credentials: 'same-origin' };
  const runsPayload = await readJson(
    await fetchImpl(atlasApiUrl(runsUrl, options.apiBase), requestOptions),
    'Atlas could not load Visualisation runs',
  );
  const runs = Array.isArray(runsPayload?.runs) ? runsPayload.runs : [];
  const preferredRun = runs.find(run => run?.selected) || runs[0];
  if (!preferredRun?.run_id) {
    return adaptModelResultCatalog({
      schema: MODEL_RESULT_CATALOG_SCHEMA,
      source: 'emil_visualisation_domain',
      project_id: context.projectId,
      model_version: modelVersion,
      runs: [],
      warnings: [],
    }, context.projectId, modelVersion);
  }
  const catalogUrl = modelResultRunCatalogRequestUrl(context, preferredRun.run_id);
  const metricPayload = await readJson(
    await fetchImpl(atlasApiUrl(catalogUrl, options.apiBase), requestOptions),
    'Atlas could not load the Visualisation catalog',
  );
  return adaptModelResultCatalog(
    adaptVisualisationCatalog(runsPayload, metricPayload, context.projectId, modelVersion),
    context.projectId,
    modelVersion,
  );
}

function stripCanonicalPrefix(value) {
  return text(value).replace(/^(Node|Line):/i, '');
}

function queryPayload(selection) {
  const lineTarget = Boolean(selection.supportsFlowMap)
    || (text(selection.className) === 'Line' && text(selection.propertyName) === 'Flow');
  const scopeNode = lineTarget ? '' : stripCanonicalPrefix(selection.scopeId);
  return {
    run_ids: [text(selection.runId)],
    report_family: text(selection.reportFamily),
    granularity: 'year',
    class_name: text(selection.className),
    property_name: text(selection.propertyName),
    group_by: lineTarget ? 'line' : 'node',
    countries: [],
    nodes: scopeNode ? [scopeNode] : [],
    categories: text(selection.category) ? [text(selection.category)] : [],
    entity_names: [],
    aggregation_method: 'sum',
    use_cache: true,
    cache_mode: 'prefer',
    limit: 20000,
  };
}

export function adaptVisualisationQuery(payload, context, selection) {
  const lineTarget = queryPayload(selection).group_by === 'line';
  const prefix = lineTarget ? 'Line' : 'Node';
  const unit = text(selection.unit);
  const values = (payload?.rows || []).flatMap(row => {
    const entityName = text(row?.group_value || (lineTarget ? row?.entity_name : row?.node));
    const value = Number(row?.value);
    if (!entityName || !Number.isFinite(value)) return [];
    return [{
      entity_id: `${prefix}:${entityName}`,
      value,
      unit: text(row?.unit_name) || unit,
      period: text(selection.period || row?.time_bucket),
      country: text(row?.country),
      node: text(row?.node),
      category: text(row?.category),
    }];
  });
  const numbers = values.map(row => row.value);
  const minimum = numbers.length ? Math.min(...numbers) : 0;
  const maximum = numbers.length ? Math.max(...numbers) : 0;
  const runLabel = text(payload?.rows?.[0]?.run_label) || text(selection.runLabel) || text(selection.runId);
  return adaptModelResultScene({
    schema: MODEL_RESULT_SCENE_SCHEMA,
    source: 'emil_visualisation_domain',
    project_id: text(context?.projectId),
    model_version: text(selection.modelVersion),
    run: { run_id: text(selection.runId), label: runLabel },
    selection: {
      id: `${text(selection.className)}.${text(selection.propertyName)}`,
      report_family: text(selection.reportFamily),
      class_name: text(selection.className),
      property_name: text(selection.propertyName),
      category: text(selection.category),
      period: text(selection.period),
      period_label: text(selection.period) ? `Annual ${text(selection.period)}` : 'Annual result',
      map_target: lineTarget ? 'link' : 'node',
    },
    legend: {
      scale: minimum < 0 && maximum > 0 ? 'diverging' : 'sequential',
      minimum,
      maximum,
      unit: unit || text(values[0]?.unit),
    },
    values,
    coverage: {
      source_row_count: Number(payload?.summary?.row_count_before_limit || payload?.rows?.length || 0),
      projected_row_count: values.length,
    },
  }, context?.projectId, selection.modelVersion);
}

export async function fetchModelResultScene(context, selection, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = modelResultSceneRequestUrl(context);
  if (!url || !selection?.runId || !selection?.className || !selection?.propertyName) {
    throw new Error('A complete model-result selection is required.');
  }
  const response = await fetchImpl(atlasApiUrl(url, options.apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryPayload(selection)),
    signal: options.signal,
    credentials: 'same-origin',
  });
  const payload = await readJson(response, 'Atlas could not query the selected Visualisation result');
  return adaptVisualisationQuery(payload, context, selection);
}

const SEQUENTIAL = ['#172554', '#0369a1', '#0d9488', '#84cc16', '#facc15'];
const DIVERGING = ['#2563eb', '#67e8f9', '#e2e8f0', '#fb923c', '#dc2626'];

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function interpolatePalette(palette, ratio) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  const scaled = clamped * (palette.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(palette.length - 1, left + 1);
  const offset = scaled - left;
  const start = hexToRgb(palette[left]);
  const end = hexToRgb(palette[right]);
  const channel = index => Math.round(start[index] + ((end[index] - start[index]) * offset));
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export function modelResultRatio(value, legend = {}) {
  const number = Number(value);
  const minimum = Number(legend.minimum);
  const maximum = Number(legend.maximum);
  if (![number, minimum, maximum].every(Number.isFinite)) return 0;
  if (minimum === maximum) return 0.5;
  return Math.max(0, Math.min(1, (number - minimum) / (maximum - minimum)));
}

export function modelResultColor(value, legend = {}) {
  return interpolatePalette(legend.scale === 'diverging' ? DIVERGING : SEQUENTIAL, modelResultRatio(value, legend));
}

export function decorateModelResultRecord(record, resultScene) {
  const row = resultScene?.valueByEntityId?.get(text(record?.id));
  if (!row) return record;
  const ratio = modelResultRatio(row.value, resultScene.legend);
  const color = modelResultColor(row.value, resultScene.legend);
  return {
    ...record,
    atlas_result_color: color,
    atlas_result_ratio: ratio,
    atlas_result_value: row.value,
    atlas_result_unit: row.unit || '',
    atlas_result_label: resultScene.selection?.property_name || resultScene.selection?.id || 'Result',
    atlas_result_period: resultScene.selection?.period_label || resultScene.selection?.period || '',
    map_scale_ratio: ratio,
    properties: [
      ...(Array.isArray(record?.properties) ? record.properties.filter(property => property?.atlas_result !== true) : []),
      {
        Property: resultScene.selection?.property_name || resultScene.selection?.id || 'Result',
        Value: row.value,
        Units: row.unit || '',
        atlas_result: true,
      },
      { Property: 'Result period', Value: resultScene.selection?.period_label || row.period || '', Units: '', atlas_result: true },
      { Property: 'Result run', Value: resultScene.run?.run_id || '', Units: '', atlas_result: true },
    ],
  };
}

export function defaultModelResultSelection(catalog) {
  const run = (catalog?.runs || []).find(item => item?.compatible && item?.quantities?.length);
  if (!run) return null;
  const priorities = ['Node.Price', 'Node.Load', 'Line.Flow', 'Generator.Generation', 'Battery.SoC'];
  const quantity = priorities.map(id => run.quantities.find(item => item.id === id)).find(Boolean)
    || run.quantities[0];
  return {
    runId: run.run_id,
    runLabel: run.label || run.run_id,
    category: '',
    quantityId: quantity.id,
    reportFamily: quantity.report_family,
    className: quantity.class_name,
    propertyName: quantity.property_name,
    unit: quantity.unit || '',
    period: quantity.periods?.[0] || run.periods?.[0] || '',
    scopeId: '',
    supportsFlowMap: Boolean(quantity.supports_flow_map),
  };
}
