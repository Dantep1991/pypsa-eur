import { atlasApiUrl } from '../config/api';
import { generationEnergyValues, resultMagnitudeRatio, resultMapModes } from './resultPresentation';
import { RESULT_SERIES_COLORS, flowReversalColor } from './resultColors';
import { withAnnualNetFlow, subtractReverseFlow } from './annualFlow';
import { objectResultTarget, fetchResultAssets, attachAssetPositions, attachPipelinePositions, fetchResultTopology } from './resultAssetProjection';

export const MODEL_RESULT_CATALOG_SCHEMA = 'nohm.atlas.result-catalog.v2';
export const MODEL_RESULT_SCENE_SCHEMA = 'nohm.atlas.result-scene.v2';

const text = value => String(value ?? '').trim();
const unique = values => [...new Set((values || []).map(text).filter(Boolean))];
const classKey = value => text(value).replace(/\s/g, '').toLowerCase();
const classMetadata = (metadata, name) => Object.entries(metadata || {}).find(([key]) => classKey(key) === classKey(name))?.[1];

export function modelResultCatalogRequestUrl(context) {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId) return null;
  return `/api/solutions/${encodeURIComponent(projectId)}/runs?discovery=registered`;
}

export function modelResultSceneRequestUrl(context) {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId) return null;
  return `/api/solutions/${encodeURIComponent(projectId)}/query`;
}

function modelResultRunCatalogRequestUrl(context, runId) {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId || !text(runId)) return null;
  return `/api/solutions/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(text(runId))}/catalog?compact=true&inventory=true`;
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

function hydrateMetric(metric, payload, schemaMetadata = {}) {
  const dimensions = payload?.metric_dimension_sets?.[metric?.dimension_set] || {};
  const className = text(metric?.class_name);
  const schemaCategories = classMetadata(schemaMetadata.categories, className);
  const schemaCategoryObjects = classMetadata(schemaMetadata.categoryObjects, className);
  return {
    id: `${className}.${text(metric?.property_name)}`,
    report_family: text(metric?.report_family),
    class_name: className,
    property_name: text(metric?.property_name),
    unit: text(metric?.unit_name),
    units_by_granularity: metric?.units_by_granularity || {},
    categories: unique(Array.isArray(schemaCategories) ? schemaCategories : []),
    category_objects: Object.fromEntries(
      Object.entries(schemaCategoryObjects || {}).map(([category, objectNames]) => [text(category), unique(objectNames)]),
    ),
    solution_categories: unique(dimensions.categories),
    countries: unique(dimensions.countries),
    nodes: unique(dimensions.nodes),
    available_granularities: unique(metric?.available_granularities),
    supports_flow_map: Boolean(metric?.supports_flow_map) || (className === 'Gas Pipeline'
      && ['Flow In', 'Flow Out', 'Flow', 'Net Flow'].includes(text(metric.property_name))),
  };
}

export function adaptVisualisationCatalog(
  runsPayload,
  metricPayload,
  expectedProjectId = '',
  modelVersion = '',
  schemaMetadata = {},
) {
  const projectId = text(metricPayload?.project_id || expectedProjectId);
  if (expectedProjectId && projectId !== expectedProjectId) {
    throw new Error(`Atlas requested ${expectedProjectId} but received results for ${projectId || 'another project'}.`);
  }
  const sourceRuns = Array.isArray(runsPayload?.runs) ? runsPayload.runs : [];
  const runs = sourceRuns.map(run => {
    // A catalogue describes one run only. Never copy its quantities onto
    // other simulations (their outputs, units and periods can differ).
    const matched = text(metricPayload?.run_id) === text(run?.run_id)
      || (!text(metricPayload?.run_id) && sourceRuns.length === 1);
    const quantities = matched ? (metricPayload?.metrics || [])
      // The result inventory owns available outputs; the active carrier's
      // schema categories are not an allowlist for other physical classes.
      .map(metric => hydrateMetric(metric, metricPayload, schemaMetadata)) : [];
    const versions = unique([run?.schema_version_id || run?.model_version_id,
      ...(run?.registry_versions || []), run?.version_hint]);
    const compatible = run?.binding_status !== 'unresolved' && Boolean(text(modelVersion))
      && versions.length > 0 && versions.every(version => version === text(modelVersion));
    const targetYear = text(run?.target_year);
    return {
      ...run,
      label: text(run?.display_name) || text(run?.run_id),
      compatible: compatible && quantities.length > 0,
      result_model_version: compatible ? text(modelVersion) : '',
      binding_reason: compatible ? '' : versions.length
        ? `Run topology: ${versions.join(', ')}; loaded topology: ${text(modelVersion)}.`
        : 'The run has no confirmed model-version binding.',
      periods: targetYear ? [targetYear] : [],
      period_granularity: 'annual',
      quantities: withAnnualNetFlow(quantities.map(quantity => ({
        ...quantity,
        periods: targetYear ? [targetYear] : [],
      }))),
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
  let schemaCategories = options.schemaCategories || {};
  if (options.includeAssetCatalog) {
    options.onProgress?.({ phase: 'coordinates', completed: 0, total: 1 });
    const assets = await fetchResultAssets(context, modelVersion, '', options, fetchImpl);
    schemaCategories = { ...schemaCategories, ...Object.fromEntries((assets.classes || []).map(item => [item.class_name, item.categories])) };
  }
  if (!runs.length) {
    return adaptModelResultCatalog({
      schema: MODEL_RESULT_CATALOG_SCHEMA,
      source: 'emil_visualisation_domain',
      project_id: context.projectId,
      model_version: modelVersion,
      runs: [],
      warnings: [],
    }, context.projectId, modelVersion);
  }
  const adapted = [];
  let completed = 0;
  let cursor = 0;
  // Bound concurrency: large run catalogues must not all deserialize together.
  const hydrate = async () => {
    while (cursor < runs.length) {
      const run = runs[cursor++];
      options.onProgress?.({ phase: 'catalog', completed, total: runs.length });
      const metricPayload = await readJson(
        await fetchImpl(atlasApiUrl(modelResultRunCatalogRequestUrl(context, run.run_id), options.apiBase), requestOptions),
        'Atlas could not load the Visualisation catalog',
      );
      if (text(metricPayload?.run_id) !== text(run.run_id)) {
        throw new Error('The Visualisation catalogue returned a different result run.');
      }
      const item = adaptVisualisationCatalog({ runs: [{ ...run, ...(metricPayload.run || {}) }] },
        metricPayload, context.projectId, modelVersion, {
          categories: schemaCategories, categoryObjects: options.schemaCategoryObjects || {},
        }).runs[0];
      adapted.push(item);
      completed += 1;
      options.onProgress?.({ phase: 'catalog', completed, total: runs.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, runs.length) }, hydrate));
  const byId = new Map(adapted.map(run => [run.run_id, run]));
  return adaptModelResultCatalog(
    { schema: MODEL_RESULT_CATALOG_SCHEMA, source: 'emil_visualisation_domain',
      project_id: context.projectId, model_version: modelVersion,
      runs: runs.map(run => byId.get(run.run_id)), warnings: runsPayload.warnings || [] },
    context.projectId,
    modelVersion,
  );
}

function stripCanonicalPrefix(value) {
  return text(value).replace(/^(Node|Line):/i, '');
}

function queryPayload(selection) {
  const lineTarget = text(selection.className) === 'Line';
  const scopeNode = stripCanonicalPrefix(selection.scopeId);
  const selectedCategory = text(selection.category);
  const categoryObjects = unique(selection.categoryObjects);
  return {
    run_ids: [text(selection.runId)],
    report_family: text(selection.reportFamily),
    granularity: 'year',
    class_name: text(selection.className),
    property_name: text(selection.propertyName),
    group_by: lineTarget ? 'line' : selection.mapMode === 'mix' || objectResultTarget(selection) || selection.className === 'Node' ? 'object' : 'node',
    countries: [],
    nodes: scopeNode && !objectResultTarget(selection) ? [scopeNode] : [],
    // Visualisation CSV categories are output dimensions, not the governed
    // model_schema categories shown by Atlas.  Filter by the exact canonical
    // model objects belonging to the selected schema category instead.
    categories: [],
    entity_names: selection.entityNames || (selectedCategory
      ? (categoryObjects.length ? categoryObjects : ['__atlas_no_schema_objects__'])
      : []),
    aggregation_method: 'auto',
    quantity_aware_aggregation: true,
    date_from: /^\d{4}$/.test(text(selection.period)) ? `${selection.period}-01-01` : undefined,
    date_to: /^\d{4}$/.test(text(selection.period)) ? `${selection.period}-12-31T23:59:59` : undefined,
    use_cache: true,
    cache_mode: 'prefer',
    limit: 20000,
  };
}

export function validatedResultRows(payload, context, selection) {
  if (payload?.project_id && text(payload.project_id) !== text(context?.projectId)) {
    throw new Error('The Visualisation query returned a different project.');
  }
  if (payload?.missing_runs?.length) {
    throw new Error(payload.missing_runs.map(run => run.reason).filter(Boolean).join(' ') || 'The selected result is unavailable.');
  }
  for (const run of payload?.runs || []) {
    const version = text(run.schema_version_id || run.model_version_id || run.version_hint);
    if (run.binding_status === 'unresolved' || version !== text(selection.modelVersion)
      || text(run.run_id) !== text(selection.runId)) {
      throw new Error('The result query is not bound to this run and loaded model version.');
    }
  }
  const sourceRows = payload?.rows || [];
  if (sourceRows.some(row => row.run_id && text(row.run_id) !== text(selection.runId))) {
    throw new Error('The result query contains a different simulation.');
  }
  if (Number(payload?.summary?.row_count_before_limit || 0) > sourceRows.length) {
    throw new Error('The result query was truncated. Narrow the scope before mapping it.');
  }
  return sourceRows;
}

export function adaptVisualisationQuery(payload, context, selection) {
  const sourceRows = validatedResultRows(payload, context, selection);
  const lineTarget = queryPayload(selection).group_by === 'line';
  const objectTarget = objectResultTarget(selection);
  const prefix = lineTarget ? 'Line' : objectTarget ? selection.className : 'Node';
  const unit = text(selection.unit);
  const values = selection.mapMode === 'mix' ? generationEnergyValues(sourceRows) : sourceRows.flatMap(row => {
    const entityName = text(row?.group_value || (lineTarget ? row?.entity_name : row?.node));
    if (row?.value == null || typeof row.value === 'boolean' || (typeof row.value === 'string' && !row.value.trim())) return [];
    const value = Number(row?.value);
    if (!entityName || !Number.isFinite(value)) return [];
    return [{
      entity_id: `${prefix}:${entityName}`,
      object_name: objectTarget ? entityName : '',
      value,
      unit: text(row?.unit_name) || unit,
      period: text(selection.period || row?.time_bucket),
      country: text(row?.country),
      node: text(row?.node),
      category: text(row?.category),
      from_node: text(row?.from_node),
      to_node: text(row?.to_node),
      actual_from_node: text(row?.actual_from_node),
      actual_to_node: text(row?.actual_to_node),
    }];
  });
  const units = unique(values.map(row => row.unit));
  if (units.length > 1) throw new Error('The result contains incompatible physical units.');
  if (new Set(values.map(row => row.entity_id)).size !== values.length) {
    throw new Error('The result contains multiple periods or duplicate objects. Select one map period.');
  }
  const numbers = values.map(row => row.value);
  const minimum = numbers.length ? Math.min(...numbers) : 0;
  const maximum = numbers.length ? Math.max(...numbers) : 0;
  const maximumMagnitude = numbers.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const categories = unique(values.flatMap(value => (value.segments || []).map(segment => segment.key))).sort();
  const colourByCategory = new Map(categories.map((key, index) => [key, RESULT_SERIES_COLORS[index % RESULT_SERIES_COLORS.length]]));
  values.forEach(row => { if (row.segments) row.segments = row.segments.map(segment => ({
    ...segment, color: colourByCategory.get(segment.key),
  })); });
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
      map_target: lineTarget || selection.className === 'Gas Pipeline' ? 'link' : 'node',
      map_mode: text(selection.mapMode) || 'colour',
      direction_supported: Boolean(selection.supportsFlowMap) && text(selection.propertyName) !== 'Flow Back',
    },
    aggregation_method: text(payload?.query?.aggregation_method),
    legend: {
      scale: minimum < 0 && maximum > 0 ? 'diverging' : 'sequential',
      minimum,
      maximum,
      maximum_magnitude: maximumMagnitude,
      unit: text(values[0]?.unit) || unit,
    },
    values,
    coverage: {
      source_row_count: Number(payload?.summary?.row_count_before_limit || payload?.rows?.length || 0),
      projected_row_count: values.length,
      unresolved_membership_count: selection.mapMode === 'mix'
        ? sourceRows.filter(row => !text(row.node)).length : 0,
    },
  }, context?.projectId, selection.modelVersion);
}

export async function fetchModelResultScene(context, selection, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = modelResultSceneRequestUrl(context);
  if (!url || !selection?.runId || !selection?.className || !selection?.propertyName) {
    throw new Error('A complete model-result selection is required.');
  }
  if (!text(selection.runModelVersion) || text(selection.runModelVersion) !== text(selection.modelVersion)) {
    throw new Error('Select a result run bound to the loaded model version before showing it on the map.');
  }
  if (selection.derivedNetFlow) {
    const forward = await fetchModelResultScene(context, { ...selection, derivedNetFlow: false, propertyName: 'Flow' }, options, fetchImpl);
    const back = await fetchModelResultScene(context, { ...selection, derivedNetFlow: false, propertyName: 'Flow Back', mapMode: 'colour' }, options, fetchImpl);
    const backRows = new Map(back.values.map(row => [row.entity_id, row]));
    if (forward.values.some(row => {
      const reverse = backRows.get(row.entity_id);
      return reverse && (row.from_node !== reverse.from_node || row.to_node !== reverse.to_node);
    })) throw new Error('Forward and reverse energy have different declared endpoints.');
    const asFlow = scene => ({ unit: scene.legend.unit, lines: scene.values.map(row => ({ id: row.entity_id, values: new Map([[selection.period, row.value]]) })) });
    const derived = subtractReverseFlow(asFlow(forward), asFlow(back), selection);
    const byId = new Map(derived.lines.map(line => [line.id, line.values.get(selection.period)]));
    const values = forward.values.map(row => { const value = byId.get(row.entity_id); return { ...row, value,
      actual_from_node: value < 0 ? row.to_node : row.from_node, actual_to_node: value < 0 ? row.from_node : row.to_node }; });
    const numbers = values.map(row => row.value);
    return adaptModelResultScene({ ...forward, values, derivation: derived.derivation,
      selection: { ...forward.selection, id: 'Line.Annual Net Flow', property_name: 'Net Flow', direction_supported: true },
      legend: { ...forward.legend, minimum: numbers.length ? Math.min(...numbers) : 0, maximum: numbers.length ? Math.max(...numbers) : 0,
        maximum_magnitude: numbers.reduce((max, value) => Math.max(max, Math.abs(value)), 0) } });
  }
  if (selection.mapMode && !resultMapModes({ class_name: selection.className, property_name: selection.propertyName,
    supports_flow_map: selection.supportsFlowMap, unit: selection.unit }).some(mode => mode.id === selection.mapMode)) {
    throw new Error('The chosen map style is not available for this quantity.');
  }
  let assets, topology;
  if (['Line', 'Gas Pipeline'].includes(selection.className)) {
    topology = await fetchResultTopology(context, selection, options, fetchImpl);
    if (selection.category) selection = { ...selection,
      categoryObjects: topology.lines.filter(line => line.category === selection.category).map(line => line.name) };
  }
  if (objectResultTarget(selection) || selection.className === 'Node') {
    options.onProgress?.({ phase: 'coordinates', completed: 0, total: 1 });
    assets = await fetchResultAssets(context, selection.modelVersion, selection.className, options, fetchImpl);
    if (selection.category) selection = { ...selection, categoryObjects: assets.objects.filter(obj => obj.category === selection.category).map(obj => obj.name) };
    if (selection.scopeId) {
      const candidates = assets.objects.filter(obj => (!selection.category || obj.category === selection.category)
        && obj.nodes.some(node => (node.position?.canonical_reference || `Node:${node.name}`) === selection.scopeId));
      selection = { ...selection, entityNames: candidates.length ? candidates.map(obj => obj.name) : ['__atlas_no_schema_objects__'] };
    }
  }
  const response = await fetchImpl(atlasApiUrl(url, options.apiBase), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(queryPayload(selection)),
    signal: options.signal,
    credentials: 'same-origin',
  });
  const payload = await readJson(response, 'Atlas could not query the selected Visualisation result');
  options.onProgress?.({ phase: 'projection', completed: 0, total: payload.rows?.length || 0 });
  const scene = adaptVisualisationQuery(payload, context, selection);
  if (topology) return attachPipelinePositions(scene, context, selection, options, fetchImpl, topology);
  return assets ? attachAssetPositions(scene, assets) : scene;
}

export function projectModelResultScene(scene, facilities = [], connections = []) {
  const mappedNodes = new Set(facilities.filter(record => record.latitude != null && record.longitude != null
    && Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude)))
    .map(record => text(record.id)));
  const spatialNodes = (scene.spatial_nodes || []).filter(node => mappedNodes.has(node.canonical_reference)
    || (node.is_reference_topology && Number.isFinite(node.latitude) && Number.isFinite(node.longitude)));
  spatialNodes.forEach(node => mappedNodes.add(node.id));
  const mappedIds = scene.selection?.map_target === 'link'
    ? new Set([...connections, ...(scene.spatial_links || [])].filter(record => mappedNodes.has(text(record.from || record.fromNode))
      && mappedNodes.has(text(record.to || record.toNode))).map(record => text(record.id))) : mappedNodes;
  const values = scene.values.filter(row => row.spatial_binding_valid !== false && mappedIds.has(text(row.entity_id)));
  const numbers = values.map(row => row.value);
  return {
    ...scene, values, spatial_nodes: spatialNodes,
    spatial_links: (scene.spatial_links || []).filter(link => values.some(row => row.entity_id === link.id)),
    valueByEntityId: new Map(values.map(row => [row.entity_id, row])),
    legend: { ...scene.legend,
      minimum: numbers.length ? Math.min(...numbers) : 0,
      maximum: numbers.length ? Math.max(...numbers) : 0,
      maximum_magnitude: numbers.reduce((max, value) => Math.max(max, Math.abs(value)), 0),
      scale_scope: 'mapped_objects',
    },
    coverage: { ...scene.coverage, mapped_row_count: values.length,
      excluded_row_count: scene.values.length - values.length },
  };
}

const SEQUENTIAL = ['#ef4444', '#f97316', '#facc15', '#84cc16', '#22c55e'];
const DIVERGING = ['#ef4444', '#fca5a5', '#e5e7eb', '#86efac', '#22c55e'];

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

export function decorateModelResultRecord(record, resultScene, theme = 'dark') {
  const row = resultScene?.valueByEntityId?.get(text(record?.id));
  if (!row) return record;
  const ratio = modelResultRatio(row.value, resultScene.legend);
  const color = row.flow_direction_changed ? flowReversalColor(theme) : row.comparison_color || modelResultColor(row.value, resultScene.legend);
  const magnitude = resultMagnitudeRatio(row.value, resultScene.legend.maximum_magnitude);
  // The backend's actual endpoints already account for sign. Reverse only
  // when physical endpoints were not provided, never twice.
  const directionValue = row.candidate_value ?? row.value;
  const from = row.actual_from_node || (directionValue < 0 ? row.to_node : row.from_node) || '';
  const to = row.actual_to_node || (directionValue < 0 ? row.from_node : row.to_node) || '';
  return {
    ...record,
    atlas_result_color: color,
    atlas_result_ratio: ratio,
    atlas_result_magnitude_ratio: magnitude,
    atlas_result_map_mode: resultScene.selection?.map_mode || 'colour',
    atlas_result_direction_supported: Boolean(resultScene.selection?.direction_supported),
    atlas_result_direction_value: row.candidate_value ?? row.value,
    atlas_result_segments: row.segments || [],
    atlas_result_value: row.value,
    atlas_result_baseline_value: row.baseline_value,
    atlas_result_candidate_value: row.candidate_value,
    atlas_result_direction_changed: Boolean(row.flow_direction_changed),
    atlas_result_baseline_from_node: row.baseline_from_node || '',
    atlas_result_baseline_to_node: row.baseline_to_node || '',
    atlas_result_unit: row.unit || '',
    atlas_result_label: `${resultScene.comparison ? 'Δ ' : ''}${resultScene.selection?.property_name || resultScene.selection?.id || 'Result'}`,
    atlas_result_period: resultScene.selection?.period_label || resultScene.selection?.period || '',
    atlas_result_from_node: from,
    atlas_result_to_node: to,
    map_scale_ratio: ['bubbles', 'flow'].includes(resultScene.selection?.map_mode) ? magnitude : ratio,
    properties: [
      ...(resultScene.comparison ? [
        { Property: 'Baseline value', Value: row.baseline_value, Units: row.unit, atlas_result: true },
        { Property: 'Candidate value', Value: row.candidate_value, Units: row.unit, atlas_result: true },
        { Property: 'Delta (candidate − baseline)', Value: row.value, Units: row.unit, atlas_result: true },
      ] : []),
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

export function modelResultConnections(connections, scene, theme = 'dark') {
  const byId = new Map(connections.map(record => [record.id, record]));
  for (const record of scene.spatial_links || []) byId.set(record.id, { ...byId.get(record.id), ...record });
  // A connection-result layer must not dress unrelated topology as an unchanged result.
  return [...byId.values()].filter(record => scene.selection?.map_target !== 'link' || scene.valueByEntityId.has(record.id))
    .map(record => decorateModelResultRecord(record, scene, theme));
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
    runModelVersion: run.result_model_version,
    category: '',
    categoryObjects: [],
    quantityId: quantity.id,
    reportFamily: quantity.report_family,
    className: quantity.class_name,
    propertyName: quantity.property_name,
    unit: quantity.unit || '',
    period: quantity.periods?.[0] || run.periods?.[0] || '',
    scopeId: '',
    supportsFlowMap: Boolean(quantity.supports_flow_map),
    ...(quantity.derived_net_flow ? { derivedNetFlow: true } : {}),
    mapMode: resultMapModes(quantity)[0].id,
  };
}
