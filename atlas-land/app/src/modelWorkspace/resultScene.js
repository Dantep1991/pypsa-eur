export const MODEL_RESULT_CATALOG_SCHEMA = 'nohm.atlas.result-catalog.v1';
export const MODEL_RESULT_SCENE_SCHEMA = 'nohm.atlas.result-scene.v1';

const text = value => String(value ?? '').trim();

export function modelResultCatalogRequestUrl(context, modelVersion = '') {
  const projectId = text(context?.projectId);
  if (context?.mode !== 'model' || !projectId) return null;
  const query = new URLSearchParams();
  if (text(modelVersion)) query.set('version', text(modelVersion));
  const suffix = query.toString();
  return `/api/emil/atlas/projects/${encodeURIComponent(projectId)}/results${suffix ? `?${suffix}` : ''}`;
}

export function modelResultSceneRequestUrl(context, selection = {}) {
  const projectId = text(context?.projectId);
  const runId = text(selection.runId);
  const className = text(selection.className);
  const propertyName = text(selection.propertyName);
  if (context?.mode !== 'model' || !projectId || !runId || !className || !propertyName) return null;
  const query = new URLSearchParams({
    class_name: className,
    property_name: propertyName,
    carrier: text(selection.carrier) || 'electricity',
  });
  if (text(selection.modelVersion)) query.set('version', text(selection.modelVersion));
  if (text(selection.period)) query.set('period', text(selection.period));
  if (text(selection.unit)) query.set('unit', text(selection.unit));
  return `/api/emil/atlas/projects/${encodeURIComponent(projectId)}/results/${encodeURIComponent(runId)}/scene?${query.toString()}`;
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

export function adaptModelResultCatalog(payload, expectedProjectId = '', expectedModelVersion = '') {
  if (!payload || payload.schema !== MODEL_RESULT_CATALOG_SCHEMA) {
    throw new Error('Atlas received an unsupported model-result catalog.');
  }
  if (expectedProjectId && payload.project_id !== expectedProjectId) {
    throw new Error(`Atlas requested ${expectedProjectId} but received results for ${payload.project_id || 'another project'}.`);
  }
  if (expectedModelVersion && payload.model_version !== expectedModelVersion) {
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
  if (expectedModelVersion && payload.model_version !== expectedModelVersion) {
    throw new Error(`Result scene targets ${payload.model_version || 'another version'}, not loaded model ${expectedModelVersion}.`);
  }
  const values = Array.isArray(payload.values) ? payload.values : [];
  const valueByEntityId = new Map(values.map(row => [text(row.entity_id), row]));
  return { ...payload, values, valueByEntityId };
}

export async function fetchModelResultCatalog(context, modelVersion, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = modelResultCatalogRequestUrl(context, modelVersion);
  if (!url) throw new Error('A bound model project is required to load Atlas results.');
  const response = await fetchImpl(url, { signal: options.signal, credentials: 'same-origin' });
  return adaptModelResultCatalog(
    await readJson(response, 'Atlas could not load model results'),
    context.projectId,
    modelVersion,
  );
}

export async function fetchModelResultScene(context, selection, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = modelResultSceneRequestUrl(context, selection);
  if (!url) throw new Error('A complete model-result selection is required.');
  const response = await fetchImpl(url, { signal: options.signal, credentials: 'same-origin' });
  return adaptModelResultScene(
    await readJson(response, 'Atlas could not load the selected result'),
    context.projectId,
    selection.modelVersion,
  );
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
    quantityId: quantity.id,
    className: quantity.class_name,
    propertyName: quantity.property_name,
    unit: quantity.unit || '',
    period: quantity.periods?.[0] || run.periods?.[0] || '',
  };
}
