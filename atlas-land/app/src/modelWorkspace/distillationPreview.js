export const DISTILLATION_PREVIEW_SCHEMA = 'nohm.atlas.distillation-preview.v1';

const text = value => String(value ?? '').trim();
const statusStyle = Object.freeze({
  retained: { color: '', opacity: 1, dashArray: '' },
  excluded: { color: '#64748b', opacity: 0.16, dashArray: '' },
  boundary_crossing: { color: '#f59e0b', opacity: 0.98, dashArray: '8 5' },
  unresolved: { color: '#a78bfa', opacity: 0.42, dashArray: '3 5' },
});

export function distillationPreviewRequestUrl(context, options = {}) {
  const projectId = text(context?.projectId);
  const countries = [...new Set((options.countries || []).map(value => text(value).toUpperCase()).filter(Boolean))].sort();
  if (context?.mode !== 'model' || !projectId || !countries.length) return null;
  const layers = [...new Set((options.layers || ['grid']).map(value => text(value).toLowerCase()).filter(Boolean))];
  const query = new URLSearchParams({
    countries: countries.join(','),
    carrier: text(options.carrier) || 'electricity',
    layers: layers.join(',') || 'grid',
  });
  if (text(options.modelVersion)) query.set('version', text(options.modelVersion));
  if (Number.isInteger(Number(options.year))) query.set('year', String(Number(options.year)));
  return `/api/emil/atlas/projects/${encodeURIComponent(projectId)}/distillation-preview?${query.toString()}`;
}

async function readJson(response) {
  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new Error(`Atlas received an unreadable distillation preview (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `HTTP ${response.status}`;
    throw new Error(`Atlas could not preview the geographical subset: ${detail}`);
  }
  return payload;
}

export function adaptDistillationPreview(payload, expectedProjectId = '', expectedModelVersion = '') {
  if (!payload || payload.schema !== DISTILLATION_PREVIEW_SCHEMA) {
    throw new Error('Atlas received an unsupported distillation-preview response.');
  }
  if (expectedProjectId && payload.project_id !== expectedProjectId) {
    throw new Error(`Atlas requested ${expectedProjectId} but received a preview for ${payload.project_id || 'another project'}.`);
  }
  if (expectedModelVersion && payload.model_version !== expectedModelVersion) {
    throw new Error(`The preview targets ${payload.model_version || 'another version'}, not loaded model ${expectedModelVersion}.`);
  }
  if (payload.capabilities?.mutates_source !== false || payload.capabilities?.executable !== false) {
    throw new Error('Atlas refused a distillation response that is not explicitly read-only and non-executable.');
  }
  if (Number(payload.counts?.reconciliation?.identity_delta) !== 0) {
    throw new Error('The distillation preview does not reconcile to the source scene.');
  }
  const classifications = Array.isArray(payload.classifications) ? payload.classifications : [];
  const classificationByEntityId = new Map();
  classifications.forEach((item) => {
    const entityId = text(item?.entity_id);
    if (!entityId || !statusStyle[item?.status]) {
      throw new Error('The distillation preview contains an invalid entity classification.');
    }
    if (classificationByEntityId.has(entityId)) {
      throw new Error(`The distillation preview classified ${entityId} more than once.`);
    }
    classificationByEntityId.set(entityId, item);
  });
  const sourceTotal = Number(payload.counts?.source?.total || 0);
  if (sourceTotal !== classifications.length) {
    throw new Error('The distillation preview classification count does not match its source total.');
  }
  return { ...payload, classifications, classificationByEntityId };
}

export async function fetchDistillationPreview(context, options = {}, fetchImpl = window.fetch.bind(window)) {
  const url = distillationPreviewRequestUrl(context, options);
  if (!url) throw new Error('Choose at least one country before previewing a geographical subset.');
  const response = await fetchImpl(url, { signal: options.signal, credentials: 'same-origin' });
  return adaptDistillationPreview(await readJson(response), context.projectId, options.modelVersion);
}

export function decorateDistillationRecord(record, preview, showContext = false) {
  if (!preview) return record;
  const classification = preview.classificationByEntityId?.get(text(record?.id));
  if (!classification) {
    return {
      ...record,
      atlas_distillation_status: 'unresolved',
      atlas_distillation_color: statusStyle.unresolved.color,
      atlas_distillation_opacity: showContext ? statusStyle.unresolved.opacity : 0,
      atlas_distillation_hidden: !showContext,
      atlas_distillation_reason: 'This displayed object was not present in the reconciled source classification.',
    };
  }
  const style = statusStyle[classification.status];
  const contextual = ['excluded', 'unresolved'].includes(classification.status);
  const hidden = contextual && !showContext;
  return {
    ...record,
    ...(style.color ? { atlas_distillation_color: style.color } : {}),
    atlas_distillation_status: classification.status,
    atlas_distillation_opacity: hidden ? 0 : style.opacity,
    atlas_distillation_hidden: hidden,
    atlas_distillation_reason: classification.reason,
    atlas_distillation_reason_code: classification.reason_code,
    ...(style.dashArray ? { dash_array: style.dashArray } : {}),
    properties: [
      ...(Array.isArray(record?.properties) ? record.properties.filter(property => property?.atlas_distillation !== true) : []),
      { Property: 'Distillation preview', Value: classification.status.replace('_', ' '), Units: '', atlas_distillation: true },
      { Property: 'Inclusion reason', Value: classification.reason, Units: '', atlas_distillation: true },
      { Property: 'Source identity', Value: classification.source_id, Units: '', atlas_distillation: true },
    ],
  };
}

export function decorateDistillationRecords(records, preview, showContext = false) {
  return (records || []).map(record => decorateDistillationRecord(record, preview, showContext));
}
